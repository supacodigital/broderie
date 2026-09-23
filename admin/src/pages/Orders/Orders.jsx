import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Eye, Search, RefreshCw, Printer, X, RotateCcw, Clock, AlertTriangle } from 'lucide-react'
import { getOrders } from '../../services/orders.service.js'
import { formatCHF } from '../../utils/chf.js'
import { STATUS_CFG } from '../../utils/orderStatus.js'
import SortIcon from '../../components/ui/SortIcon/SortIcon.jsx'
import Pagination from '../../components/ui/Pagination/Pagination.jsx'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import SkeletonTable from '../../components/ui/SkeletonTable/SkeletonTable.jsx'
import s from './Orders.module.css'

const DEFAULT_LIMIT = 20
const PER_PAGE_OPTIONS = [20, 50, 100]

/* Vues rapides — regroupent les statuts par geste métier.
   « À traiter » = tout ce qui attend une action de la boutique ; « Impayées » =
   les factures en attente de règlement, qui servent aux relances, et les
   paiements carte / Twint en attente ou refusés. */
const PRESETS = [
  { key: 'todo',   label: 'À traiter', statuses: ['pending', 'paid', 'processing', 'pending_pickup'] },
  { key: 'unpaid', label: 'Impayées',  statuses: ['pending_invoice', 'awaiting_payment', 'payment_failed'] },
  { key: 'ready',  label: 'Prêtes',    statuses: ['ready_for_pickup', 'shipped'] },
]

const STATUS_OPTIONS = [
  { value: '',                 label: 'Tous les statuts' },
  { value: 'pending',          label: 'En attente' },
  { value: 'awaiting_payment', label: 'En attente de paiement' },
  { value: 'payment_failed',   label: 'Paiement refusé' },
  { value: 'pending_invoice',  label: 'Facture à payer' },
  { value: 'pending_pickup',   label: 'Retrait en attente' },
  { value: 'ready_for_pickup', label: 'Prête pour le retrait' },
  { value: 'paid',             label: 'Payée' },
  { value: 'processing',       label: 'En préparation' },
  { value: 'shipped',          label: 'Expédiée' },
  { value: 'delivered',        label: 'Livrée' },
  { value: 'cancelled',        label: 'Annulée' },
  { value: 'refunded',         label: 'Remboursée' },
]

function StatusBadge({ status }) {
  const c   = STATUS_CFG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' }
  const Icon = c.icon
  return (
    <span className={s.badge} style={{ color: c.color, background: c.bg }}>
      {Icon && <Icon size={10} />}
      {c.label}
    </span>
  )
}

/* Statuts qui attendent une action de la boutique — au-delà de quelques jours,
   une commande dans cet état est un oubli, pas un délai normal. */
const ACTIONABLE = ['pending', 'paid', 'processing', 'pending_pickup', 'pending_invoice', 'awaiting_payment']

const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)

function formatDate(iso) {
  return new Intl.DateTimeFormat('fr-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

/* ── Page principale ── */
export default function Orders() {
  const navigate = useNavigate()
  const [orders,  setOrders]  = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  /* Recherche, filtres, tri et page vivent dans l'URL — même raison que sur la
     liste produits : Julie ouvre une commande, la traite, puis revient. Avec un
     état local, ce retour repartait de zéro et il fallait refiltrer. L'URL rend
     aussi une vue partageable (« les factures impayées ») et survit à un
     rafraîchissement. */
  const [searchParams, setSearchParams] = useSearchParams()
  const getParam = (key, fallback = '') => searchParams.get(key) ?? fallback

  const setParams = useCallback((changes, { resetPage = true } = {}) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(changes)) {
        if (value === '' || value === false || value === null || value === undefined) next.delete(key)
        else next.set(key, String(value))
      }
      if (resetPage) next.delete('page')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const page         = Math.max(1, parseInt(getParam('page', '1'), 10) || 1)
  const search       = getParam('q')
  const statusFilter = getParam('status')
  const dateFrom     = getParam('date_from')
  const dateTo       = getParam('date_to')
  const sortCol      = getParam('sort', 'created_at')
  const sortDir      = getParam('order', 'desc')
  const perPage      = Math.min(100, Math.max(10, parseInt(getParam('limit', String(DEFAULT_LIMIT)), 10) || DEFAULT_LIMIT))

  /* Le champ garde son état pendant la frappe ; l'URL n'est mise à jour qu'après
     le debounce, pour ne pas lancer une requête à chaque lettre. */
  const [searchInput, setSearchInput] = useState(search)
  const searchTimer = useRef(null)
  const handleSearchChange = (value) => {
    setSearchInput(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setParams({ q: value }), 300)
  }
  useEffect(() => { setSearchInput(search) }, [search])
  useEffect(() => () => clearTimeout(searchTimer.current), [])

  const setPage = useCallback((p) => setParams({ page: p > 1 ? p : '' }, { resetPage: false }), [setParams])

  const handleSort = (col) => {
    const newDir = sortCol === col ? (sortDir === 'asc' ? 'desc' : 'asc') : 'desc'
    setParams({ sort: col, order: newDir })
  }

  /* Statuts sélectionnés — le backend accepte déjà une liste séparée par des
     virgules, mais l'interface n'exposait qu'un choix unique. Or « ce qu'il me
     reste à traiter » couvre toujours plusieurs statuts à la fois. */
  const selectedStatuses = statusFilter ? statusFilter.split(',').filter(Boolean) : []
  const toggleStatus = (value) => {
    const next = selectedStatuses.includes(value)
      ? selectedStatuses.filter(v => v !== value)
      : [...selectedStatuses, value]
    setParams({ status: next.join(',') })
  }

  /* Vues rapides : un clic pose l'ensemble de statuts correspondant au geste
     métier, au lieu de cocher les cases une à une. */
  const applyPreset = (statuses) => {
    const value = statuses.join(',')
    setParams({ status: statusFilter === value ? '' : value, date_from: '', date_to: '' })
  }

  const activeFilterCount = [statusFilter, dateFrom, dateTo].filter(Boolean).length
  const resetFilters = () => setParams({ status: '', date_from: '', date_to: '' })

  /* Popover des filtres — fermé à l'arrivée, les puces suffisant à montrer
     ce qui est appliqué. */
  const [showFilters, setShowFilters] = useState(false)
  const filterRef = useRef(null)
  useEffect(() => {
    if (!showFilters) return
    const onPointerDown = (e) => { if (!filterRef.current?.contains(e.target)) setShowFilters(false) }
    const onKey = (e) => { if (e.key === 'Escape') setShowFilters(false) }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showFilters])

  /* Raccourci « / » vers la recherche */
  const searchRef = useRef(null)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const [refreshTick, setRefreshTick] = useState(0)
  const load = () => setRefreshTick(t => t + 1)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setError(false)
      setLoading(true)
      try {
        const params = new URLSearchParams({ page, limit: perPage, sort: sortCol, order: sortDir })
        if (statusFilter) params.set('status', statusFilter)
        if (search)       params.set('q', search)
        if (dateFrom)     params.set('date_from', dateFrom)
        if (dateTo)       params.set('date_to', dateTo)
        const res = await getOrders(Object.fromEntries(params))
        if (!cancelled) {
          setOrders(res.data ?? [])
          setTotal(res.pagination?.total ?? 0)
        }
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [page, perPage, statusFilter, search, dateFrom, dateTo, sortCol, sortDir, refreshTick])

  const totalPages = Math.ceil(total / perPage)

  /* Libellés des filtres actifs, pour les puces */
  const activeChips = useMemo(() => {
    const chips = []
    for (const st of selectedStatuses) {
      const opt = STATUS_OPTIONS.find(o => o.value === st)
      chips.push({ key: `status:${st}`, label: 'Statut', value: opt?.label ?? st, onRemove: () => toggleStatus(st) })
    }
    if (dateFrom) chips.push({ key: 'date_from', label: 'Depuis', value: dateFrom, onRemove: () => setParams({ date_from: '' }) })
    if (dateTo)   chips.push({ key: 'date_to',   label: "Jusqu'au", value: dateTo, onRemove: () => setParams({ date_to: '' }) })
    return chips
  }, [statusFilter, dateFrom, dateTo])

  return (
    <div className={s.page}>
      <div className={s.pageHead}>
        <h1 className={s.pageTitle}>Commandes</h1>
        <span className={s.total}>{total} commande{total !== 1 ? 's' : ''}</span>
      </div>

      <div className={s.toolbar}>
        <div className={s.searchWrap}>
          <Search size={14} className={s.searchIcon} />
          <input
            ref={searchRef}
            type="search"
            className={s.searchInput}
            placeholder="N° de commande, facture, client ou suivi…"
            value={searchInput}
            onChange={e => handleSearchChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape' && searchInput) { handleSearchChange(''); e.currentTarget.blur() } }}
          />
          <kbd className={s.searchKbd}>/</kbd>
        </div>

        {/* Vues rapides — un clic pour « ce qu'il me reste à faire », au lieu de
            cocher plusieurs statuts un par un. */}
        {PRESETS.map(p => (
          <button
            key={p.key}
            className={`${s.quickFilter} ${statusFilter === p.statuses.join(',') ? s.quickFilterOn : ''}`}
            onClick={() => applyPreset(p.statuses)}
            aria-pressed={statusFilter === p.statuses.join(',')}
          >
            {p.label}
          </button>
        ))}

        <div className={s.filterAnchor} ref={filterRef}>
          <button
            className={`${s.quickFilter} ${showFilters || activeFilterCount > 0 ? s.quickFilterOn : ''}`}
            onClick={() => setShowFilters(v => !v)}
            aria-expanded={showFilters}
            aria-haspopup="dialog"
          >
            Filtres
            {activeFilterCount > 0 && <span className={s.filterBadge}>{activeFilterCount}</span>}
          </button>

          {showFilters && (
            <div className={s.filterPanel}>
              <div className={s.filterBlock}>
                <span className={s.filterLabel}>Statut</span>
                <div className={s.statusGrid}>
                  {STATUS_OPTIONS.filter(o => o.value).map(o => (
                    <label key={o.value} className={s.statusCheck}>
                      <input
                        type="checkbox"
                        checked={selectedStatuses.includes(o.value)}
                        onChange={() => toggleStatus(o.value)}
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Période — sert au point comptable trimestriel */}
              <div className={s.filterBlock}>
                <span className={s.filterLabel}>Période</span>
                <div className={s.dateRow}>
                  <label className={s.dateField}>
                    Du
                    <input
                      type="date"
                      className={s.dateInput}
                      value={dateFrom}
                      max={dateTo || undefined}
                      onChange={e => setParams({ date_from: e.target.value })}
                    />
                  </label>
                  <label className={s.dateField}>
                    Au
                    <input
                      type="date"
                      className={s.dateInput}
                      value={dateTo}
                      min={dateFrom || undefined}
                      onChange={e => setParams({ date_to: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              <div className={s.filterActions}>
                {activeFilterCount > 0 && (
                  <button className={s.filterClearBtn} onClick={resetFilters}>
                    <RotateCcw size={12} /> Tout effacer
                  </button>
                )}
                <button className={s.filterApplyBtn} onClick={() => setShowFilters(false)}>
                  Voir les {total.toLocaleString('fr-CH')} résultat{total > 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={s.toolbarRight}>
          <label className={s.perPageLabel}>
            Afficher
            <select
              className={s.perPageSelect}
              value={perPage}
              onChange={e => setParams({ limit: Number(e.target.value) === DEFAULT_LIMIT ? '' : e.target.value })}
            >
              {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button className={s.refreshBtn} onClick={load} aria-label="Rafraîchir">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Puces des filtres actifs */}
      {activeChips.length > 0 && (
        <div className={s.chips}>
          {activeChips.map(chip => (
            <button key={chip.key} className={s.chip} onClick={chip.onRemove}>
              <span className={s.chipLabel}>{chip.label}</span>
              <span className={s.chipValue}>{chip.value}</span>
              <X size={12} className={s.chipX} />
            </button>
          ))}
          <button className={s.chipReset} onClick={resetFilters}>
            <RotateCcw size={12} /> Tout effacer
          </button>
        </div>
      )}

      {error && <ErrorBanner onRetry={load} />}

      <div className={s.card}>
        <div className={s.tableHead}>
          <span>#</span>
          <span>Client</span>
          <button className={s.sortHeader} onClick={() => handleSort('created_at')}>
            Date <SortIcon col="created_at" sortCol={sortCol} sortDir={sortDir} />
          </button>
          <button className={s.sortHeader} onClick={() => handleSort('total')}>
            Total <SortIcon col="total" sortCol={sortCol} sortDir={sortDir} />
          </button>
          <span>Statut</span>
          <span></span>
        </div>

        {loading ? (
          <SkeletonTable rows={5} cols={6} />
        ) : orders.length === 0 ? (
          <div className={s.empty}>
            <p className={s.emptyTitle}>Aucune commande ne correspond.</p>
            {(activeFilterCount > 0 || search) && (
              <>
                <p className={s.emptyHint}>
                  {search && <>Recherche « <strong>{search}</strong> »</>}
                  {search && activeFilterCount > 0 && ' et '}
                  {activeFilterCount > 0 && <>{activeFilterCount} filtre{activeFilterCount > 1 ? 's' : ''} actif{activeFilterCount > 1 ? 's' : ''}</>}.
                </p>
                <div className={s.emptyActions}>
                  {activeFilterCount > 0 && (
                    <button className={s.emptyBtn} onClick={resetFilters}>
                      <RotateCcw size={13} /> Effacer les filtres
                    </button>
                  )}
                  {search && (
                    <button className={s.emptyBtn} onClick={() => handleSearchChange('')}>
                      <X size={13} /> Effacer la recherche
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          orders.map(order => (
            <div key={order.id} className={s.tableRow} onClick={() => navigate(`/commandes/${order.id}`)}>
              <div className={s.idCell}>
                <span className={s.orderId}>#{order.id}</span>
                {/* Le n° de facture est la référence que le client cite au téléphone */}
                {order.invoice_number && (
                  <span className={s.invoiceNo}>{order.invoice_number}</span>
                )}
              </div>
              <div className={s.customerCell}>
                <span className={s.customerName}>{order.first_name} {order.last_name}</span>
                <span className={s.customerEmail}>{order.email}</span>
              </div>
              <div className={s.dateCell}>
                <span className={s.muted}>{formatDate(order.created_at)}</span>
                {/* Ancienneté signalée seulement sur les commandes en attente
                    d'action : au-delà de 3 jours, c'est un oubli à rattraper. */}
                {ACTIONABLE.includes(order.status) && daysSince(order.created_at) >= 3 && (
                  <span className={s.ageWarn} title={`En attente depuis ${daysSince(order.created_at)} jours`}>
                    <Clock size={11} /> {daysSince(order.created_at)} j
                  </span>
                )}
              </div>
              <span className={s.bold}>{formatCHF(order.total)}</span>
              <div className={s.statusCell}>
                <StatusBadge status={order.status} />
                {/* Facture papier demandée — visible dès la liste, c'est au moment
                    de préparer le colis que l'information sert. */}
                {!!order.wants_printed_invoice && (
                  <span className={s.printedInvoiceBadge} title="Facture imprimée demandée">
                    <Printer size={12} aria-hidden="true" />
                    Facture papier
                  </span>
                )}
              </div>
              <button
                className={s.iconBtn}
                onClick={e => { e.stopPropagation(); navigate(`/commandes/${order.id}`) }}
                aria-label="Voir le détail"
              >
                <Eye size={15} />
              </button>
            </div>
          ))
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={total} perPage={perPage} />
    </div>
  )
}
