import { useEffect, useState, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { getCustomers } from '../../services/customers.service.js'
import { formatDate } from '../../utils/date.js'
import { formatCustomerNumber } from '../../utils/customerNumber.js'
import SortIcon from '../../components/ui/SortIcon/SortIcon.jsx'
import Pagination from '../../components/ui/Pagination/Pagination.jsx'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import SkeletonTable from '../../components/ui/SkeletonTable/SkeletonTable.jsx'
import s from './Customers.module.css'

const LIMIT = 20

function initials(first, last) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '?'
}

/* ── Page principale ── */
export default function Customers() {
  /* Recherche, page et tri vivent dans l'URL : en revenant d'une fiche client,
     la liste réapparaît telle qu'on l'avait laissée. */
  const [searchParams, setSearchParams] = useSearchParams()
  const page            = Math.max(1, Number(searchParams.get('page')) || 1)
  const debouncedSearch = searchParams.get('q') ?? ''
  const sortCol         = searchParams.get('sort') ?? 'created_at'
  const sortDir         = searchParams.get('order') === 'asc' ? 'asc' : 'desc'

  const [customers,   setCustomers]   = useState([])
  const [total,       setTotal]       = useState(0)
  const [search,      setSearch]      = useState(debouncedSearch)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const debounceRef = useRef(null)

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  // Retour arrière vers une autre recherche : le champ suit l'URL
  useEffect(() => { setSearch(debouncedSearch) }, [debouncedSearch])

  const updateParams = (changes, options) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      Object.entries(changes).forEach(([key, value]) => {
        if (value === null || value === '') next.delete(key)
        else next.set(key, String(value))
      })
      return next
    }, options)
  }

  /* Debounce 300ms sur la recherche — la frappe remplace l'entrée d'historique
     au lieu d'en créer une par lettre */
  const handleSearch = (val) => {
    setSearch(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      updateParams({ q: val, page: null }, { replace: true })
    }, 300)
  }

  const handleSort = (col) => {
    const newDir = sortCol === col ? (sortDir === 'asc' ? 'desc' : 'asc') : 'desc'
    updateParams({ sort: col, order: newDir, page: null })
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setError(false)
      setLoading(true)
      try {
        const params = { page, limit: LIMIT, sort: sortCol, order: sortDir }
        if (debouncedSearch.trim()) params.q = debouncedSearch.trim()
        const res = await getCustomers(params)
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
            placeholder="Rechercher par nom, e-mail ou n° client…"
            aria-label="Rechercher un client"
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
            <Link key={c.id} to={`/clients/${c.id}`} className={s.tableRow}>
              <div className={s.clientCell}>
                <div className={s.avatar} aria-hidden="true">{initials(c.first_name, c.last_name)}</div>
                <div className={s.clientText}>
                  <span className={s.clientName}>{c.first_name} {c.last_name}</span>
                  <span className={s.clientNumber}>{formatCustomerNumber(c.id)}</span>
                </div>
              </div>
              <span className={s.muted}>{c.email}</span>
              <span className={s.localeBadge}>{c.locale?.toUpperCase()}</span>
              <span className={s.muted}>{formatDate(c.created_at)}</span>
              <span className={s.bold}>{c.order_count ?? 0}</span>
            </Link>
          ))
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={p => updateParams({ page: p === 1 ? null : p })} />
    </div>
  )
}
