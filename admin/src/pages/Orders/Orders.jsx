import { useEffect, useState } from 'react'
import { useDebounceSearch } from '../../hooks/useDebounceSearch.js'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Eye, Search, RefreshCw } from 'lucide-react'
import { getOrders } from '../../services/orders.service.js'
import { formatCHF } from '../../utils/chf.js'
import { STATUS_CFG } from '../../utils/orderStatus.js'
import SortIcon from '../../components/ui/SortIcon/SortIcon.jsx'
import Pagination from '../../components/ui/Pagination/Pagination.jsx'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import SkeletonTable from '../../components/ui/SkeletonTable/SkeletonTable.jsx'
import s from './Orders.module.css'

const LIMIT = 20

const STATUS_OPTIONS = [
  { value: '',                 label: 'Tous les statuts' },
  { value: 'pending',          label: 'En attente' },
  { value: 'awaiting_payment', label: 'Att. paiement' },
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

function formatDate(iso) {
  return new Intl.DateTimeFormat('fr-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

/* ── Page principale ── */
export default function Orders() {
  const navigate = useNavigate()
  const [orders,       setOrders]       = useState([])
  const [total,        setTotal]        = useState(0)
  const [searchParams, setSearchParams] = useSearchParams()
  const [page,         setPage]         = useState(1)
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') ?? '')
  const { search: searchInput, debouncedSearch: search, handleSearch: handleSearchChange } = useDebounceSearch(300, () => setPage(1))
  const [sortCol,      setSortCol]      = useState('created_at')
  const [sortDir,      setSortDir]      = useState('desc')
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(false)

  const handleSort = (col) => {
    const newDir = sortCol === col ? (sortDir === 'asc' ? 'desc' : 'asc') : 'desc'
    setSortCol(col)
    setSortDir(newDir)
    setPage(1)
  }

  const [refreshTick, setRefreshTick] = useState(0)
  const load = () => setRefreshTick(t => t + 1)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setError(false)
      setLoading(true)
      try {
        const params = new URLSearchParams({ page, limit: LIMIT, sort: sortCol, order: sortDir })
        if (statusFilter) params.set('status', statusFilter)
        if (search)       params.set('q', search)
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
  }, [page, statusFilter, search, sortCol, sortDir, refreshTick])

  /* Applique le filtre status si on arrive depuis le dashboard avec ?status= */
  useEffect(() => {
    const s = searchParams.get('status')
    if (s !== null) setStatusFilter(s)
  }, [searchParams])

  const totalPages = Math.ceil(total / LIMIT)

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
            type="search"
            className={s.searchInput}
            placeholder="Rechercher par #ID ou client…"
            value={searchInput}
            onChange={e => handleSearchChange(e.target.value)}
          />
        </div>
        <select
          className={s.select}
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          aria-label="Filtrer par statut"
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button className={s.refreshBtn} onClick={load} aria-label="Rafraîchir">
          <RefreshCw size={14} />
        </button>
      </div>

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
          <p className={s.empty}>Aucune commande trouvée.</p>
        ) : (
          orders.map(order => (
            <div key={order.id} className={s.tableRow} onClick={() => navigate(`/commandes/${order.id}`)}>
              <span className={s.orderId}>#{order.id}</span>
              <div className={s.customerCell}>
                <span className={s.customerName}>{order.first_name} {order.last_name}</span>
                <span className={s.customerEmail}>{order.email}</span>
              </div>
              <span className={s.muted}>{formatDate(order.created_at)}</span>
              <span className={s.bold}>{formatCHF(order.total)}</span>
              <StatusBadge status={order.status} />
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

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  )
}
