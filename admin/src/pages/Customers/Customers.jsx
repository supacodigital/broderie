import { useEffect, useState, useRef } from 'react'
import {
  Search, X,
  MapPin, ShoppingBag, AlertTriangle, Gift,
} from 'lucide-react'
import { getCustomers, getCustomerById } from '../../services/customers.service.js'
import { formatCHF } from '../../utils/chf.js'
import { STATUS_CFG } from '../../utils/orderStatus.js'
import { formatDate, formatDateLong } from '../../utils/date.js'
import SortIcon from '../../components/ui/SortIcon/SortIcon.jsx'
import Pagination from '../../components/ui/Pagination/Pagination.jsx'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import SkeletonTable from '../../components/ui/SkeletonTable/SkeletonTable.jsx'
import s from './Customers.module.css'

const LIMIT = 20

function initials(first, last) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '?'
}

/* ── Modale détail client ── */
function CustomerModal({ customerId, onClose }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    getCustomerById(customerId)
      .then(res => { if (!cancelled) setData(res ?? null) })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [customerId])

  const validOrders = (data?.orders ?? []).filter(o => !['cancelled', 'refunded'].includes(o.status))
  const totalSpend  = validOrders.reduce((sum, o) => sum + parseFloat(o.total ?? 0), 0)
  const lastOrder   = data?.orders?.[0] ?? null

  return (
    <div className={s.overlay} onClick={onClose} onKeyDown={e => e.key === 'Escape' && onClose()} tabIndex={-1}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>

        {/* ── En-tête sticky ── */}
        <div className={s.modalHead}>
          <div className={s.modalHeadLeft}>
            {data && <div className={s.avatarMd}>{initials(data.first_name, data.last_name)}</div>}
            <div>
              <h2 className={s.modalTitle}>
                {data ? `${data.first_name} ${data.last_name}` : 'Fiche client'}
              </h2>
              {data && <p className={s.modalSub}>Client #{data.id}</p>}
            </div>
          </div>
          <button className={s.closeBtn} onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>

        {loading ? (
          <div className={s.modalLoading}><div className={s.spinner} /></div>
        ) : error ? (
          <p className={s.modalError}><AlertTriangle size={14} /> Impossible de charger ce client.</p>
        ) : !data ? (
          <p className={s.modalError}>Client introuvable.</p>
        ) : (
          <div className={s.modalBody}>

            {/* ── Bloc coordonnées ── */}
            <div className={s.coordBlock}>
              <div className={s.coordRow}>
                <span className={s.coordLabel}>E-mail</span>
                <a href={`mailto:${data.email}`} className={s.coordValue}>{data.email}</a>
              </div>
              <div className={s.coordRow}>
                <span className={s.coordLabel}>Langue</span>
                <span className={s.coordValue}>
                  <span className={s.localeBadge}>{data.locale?.toUpperCase()}</span>
                </span>
              </div>
              <div className={s.coordRow}>
                <span className={s.coordLabel}>Statut</span>
                <span className={s.activeBadge} data-active={String(!!data.is_active)}>
                  {data.is_active ? 'Actif' : 'Inactif'}
                </span>
              </div>
              <div className={s.coordRow}>
                <span className={s.coordLabel}>Inscrit le</span>
                <span className={s.coordValue}>{formatDateLong(data.created_at)}</span>
              </div>
              {lastOrder && (
                <div className={s.coordRow}>
                  <span className={s.coordLabel}>Dernière commande</span>
                  <span className={s.coordValue}>{formatDateLong(lastOrder.created_at)}</span>
                </div>
              )}
            </div>

            {/* ── KPIs ── */}
            <div className={s.kpiRow}>
              <div className={s.kpi}>
                <span className={s.kpiVal}>{data.orders?.length ?? 0}</span>
                <span className={s.kpiLbl}>Commande{(data.orders?.length ?? 0) > 1 ? 's' : ''}</span>
              </div>
              <div className={s.kpi}>
                <span className={s.kpiVal}>{formatCHF(totalSpend)}</span>
                <span className={s.kpiLbl}>CA total</span>
              </div>
              <div className={s.kpi}>
                <span className={s.kpiVal}>{data.addresses?.length ?? 0}</span>
                <span className={s.kpiLbl}>Adresse{(data.addresses?.length ?? 0) > 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* ── Adresses ── */}
            <h3 className={s.sectionTitle}><MapPin size={13} /> Adresses</h3>
            {(data.addresses ?? []).length === 0 ? (
              <p className={s.emptySection}>Aucune adresse enregistrée.</p>
            ) : (
              <div className={s.addressList}>
                {data.addresses.map(addr => (
                  <div key={addr.id} className={`${s.addressCard} ${addr.is_default ? s.addressDefault : ''}`}>
                    {addr.is_default && <span className={s.defaultBadge}>Par défaut</span>}
                    <div className={s.addressGrid}>
                      {addr.label && (
                        <div className={s.addressField}>
                          <span className={s.addressFieldLabel}>Libellé</span>
                          <span className={s.addressFieldValue}>{addr.label}</span>
                        </div>
                      )}
                      <div className={s.addressField}>
                        <span className={s.addressFieldLabel}>Rue</span>
                        <span className={s.addressFieldValue}>{addr.street} {addr.street_number}</span>
                      </div>
                      <div className={s.addressField}>
                        <span className={s.addressFieldLabel}>Localité</span>
                        <span className={s.addressFieldValue}>
                          {addr.zip} {addr.city}{addr.canton ? ` (${addr.canton})` : ''}
                        </span>
                      </div>
                      <div className={s.addressField}>
                        <span className={s.addressFieldLabel}>Pays</span>
                        <span className={s.addressFieldValue}>{addr.country}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Fidélité ── */}
            <h3 className={s.sectionTitle}><Gift size={13} /> Fidélité</h3>
            {!data.loyalty ? (
              <p className={s.emptySection}>Aucun compte fidélité.</p>
            ) : (
              <div className={s.loyaltyBlock}>
                <div className={s.loyaltyTop}>
                  <div>
                    <span className={s.loyaltySpend}>
                      {formatCHF(data.loyalty.total_spend_chf)}
                    </span>
                    <span className={s.loyaltySpendLbl}> cumulés</span>
                  </div>
                  {data.loyalty.tier_name
                    ? <span className={s.tierBadge}>{data.loyalty.tier_name}</span>
                    : <span className={s.tierNone}>Aucun palier atteint</span>
                  }
                </div>
                {(data.loyalty.rewards ?? []).length > 0 ? (
                  <div className={s.rewardList}>
                    {data.loyalty.rewards.map((r, i) => (
                      <div key={i} className={s.rewardRow}>
                        <span className={s.rewardCode}>{r.code}</span>
                        <span className={s.rewardVal}>
                          {r.type === 'fixed' ? formatCHF(r.value) : `${r.value}%`}
                        </span>
                        <span className={s.rewardTier}>{r.tier_name}</span>
                        <span className={s.rewardStatus} data-status={r.status}>
                          {{ available: 'Disponible', used: 'Utilisé', expired: 'Expiré', pending: 'En attente' }[r.status] ?? r.status}
                        </span>
                        {r.expires_at && r.status === 'available' && (
                          <span className={s.rewardExpiry}>exp. {formatDate(r.expires_at)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={s.rewardEmpty}>Aucun bon de réduction.</p>
                )}
              </div>
            )}

            {/* ── Historique commandes ── */}
            <h3 className={s.sectionTitle}><ShoppingBag size={13} /> Commandes</h3>
            {(data.orders ?? []).length === 0 ? (
              <p className={s.emptySection}>Aucune commande.</p>
            ) : (
              <div className={s.orderList}>
                <div className={s.orderListHead}>
                  <span>#</span>
                  <span>Date</span>
                  <span>Total</span>
                  <span>Statut</span>
                </div>
                {data.orders.map(o => {
                  const cfg = STATUS_CFG[o.status] ?? { label: o.status, color: '#6b7280' }
                  return (
                    <div key={o.id} className={s.orderListRow}>
                      <span className={s.orderId}>#{String(o.id).padStart(5, '0')}</span>
                      <span className={s.orderDate}>{formatDate(o.created_at)}</span>
                      <span className={s.orderTotal}>{formatCHF(o.total)}</span>
                      <span className={s.orderStatus} style={{ color: cfg.color, background: `${cfg.color}18` }}>
                        {cfg.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}

/* ── Page principale ── */
export default function Customers() {
  const [customers,      setCustomers]      = useState([])
  const [total,          setTotal]          = useState(0)
  const [page,           setPage]           = useState(1)
  const [search,         setSearch]         = useState('')
  const [debouncedSearch,setDebouncedSearch]= useState('')
  const [sortCol,        setSortCol]        = useState('created_at')
  const [sortDir,        setSortDir]        = useState('desc')
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState(false)
  const [selected,       setSelected]       = useState(null)
  const [refreshTick,    setRefreshTick]    = useState(0)
  const debounceRef = useRef(null)

  /* Debounce 300ms sur la recherche */
  const handleSearch = (val) => {
    setSearch(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(val)
      setPage(1)
    }, 300)
  }

  const handleSort = (col) => {
    const newDir = sortCol === col ? (sortDir === 'asc' ? 'desc' : 'asc') : 'desc'
    setSortCol(col)
    setSortDir(newDir)
    setPage(1)
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setError(false)
      setLoading(true)
      try {
        const params = new URLSearchParams({ page, limit: LIMIT, sort: sortCol, order: sortDir })
        if (debouncedSearch) params.set('q', debouncedSearch)
        const res = await getCustomers(Object.fromEntries(params))
        if (!cancelled) {
          setCustomers(res.data ?? [])
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
  }, [page, debouncedSearch, sortCol, sortDir, refreshTick])

  const load = () => setRefreshTick(t => t + 1)

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className={s.page}>
      {selected && (
        <CustomerModal customerId={selected} onClose={() => setSelected(null)} />
      )}

      <div className={s.pageHead}>
        <h1 className={s.pageTitle}>Clients</h1>
        <span className={s.total}>{total.toLocaleString('fr-CH')} client{total !== 1 ? 's' : ''}</span>
      </div>

      <div className={s.toolbar}>
        <div className={s.searchWrap}>
          <Search size={14} className={s.searchIcon} />
          <input
            type="search"
            className={s.searchInput}
            placeholder="Rechercher par nom ou e-mail…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <ErrorBanner onRetry={load} />}

      <div className={s.card}>
        <div className={s.tableHead}>
          <span>Client</span>
          <span>E-mail</span>
          <span>Langue</span>
          <button className={s.sortHeader} onClick={() => handleSort('created_at')}>
            Inscrit le <SortIcon col="created_at" sortCol={sortCol} sortDir={sortDir} />
          </button>
          <button className={s.sortHeader} onClick={() => handleSort('order_count')}>
            Commandes <SortIcon col="order_count" sortCol={sortCol} sortDir={sortDir} />
          </button>
        </div>

        {loading ? (
          <SkeletonTable rows={8} cols={5} />
        ) : customers.length === 0 ? (
          <p className={s.empty}>Aucun client trouvé.</p>
        ) : (
          customers.map(c => (
            <div key={c.id} className={s.tableRow} onClick={() => setSelected(c.id)}>
              <div className={s.clientCell}>
                <div className={s.avatar}>{initials(c.first_name, c.last_name)}</div>
                <span className={s.clientName}>{c.first_name} {c.last_name}</span>
              </div>
              <span className={s.muted}>{c.email}</span>
              <span className={s.localeBadge}>{c.locale?.toUpperCase()}</span>
              <span className={s.muted}>{formatDate(c.created_at)}</span>
              <span className={s.bold}>{c.order_count ?? 0}</span>
            </div>
          ))
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  )
}
