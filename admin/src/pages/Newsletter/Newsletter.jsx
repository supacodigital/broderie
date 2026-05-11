import { useEffect, useState, useCallback } from 'react'
import { Download, Trash2, Mail, Search } from 'lucide-react'
import { getSubscribers, unsubscribeSubscriber, exportCsv } from '../../services/newsletter.service.js'
import { formatDate } from '../../utils/date.js'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog/ConfirmDialog.jsx'
import Pagination from '../../components/ui/Pagination/Pagination.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import { useDebounceSearch } from '../../hooks/useDebounceSearch.js'
import s from './Newsletter.module.css'

const LIMIT = 20

const FILTERS = [
  { value: 'all',    label: 'Tous'         },
  { value: 'active', label: 'Abonnés'      },
  { value: 'inactive', label: 'Désabonnés' },
]

export default function Newsletter() {
  const toast = useToast()
  const [subscribers, setSubscribers] = useState([])
  const [total,       setTotal]       = useState(0)
  const [filter,      setFilter]      = useState('active')
  const [page,        setPage]        = useState(1)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(false)
  const [confirm,     setConfirm]     = useState(null)
  const [exporting,   setExporting]   = useState(false)

  const { search: searchInput, debouncedSearch: search, handleSearch } = useDebounceSearch(300, () => setPage(1))

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const params = { limit: LIMIT, page, search }
      if (filter === 'active')   params.active = '1'
      if (filter === 'inactive') params.active = '0'
      const res = await getSubscribers(params)
      setSubscribers(res.data ?? [])
      setTotal(res.pagination?.total ?? 0)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [filter, page, search])

  useEffect(() => { load() }, [load])

  const handleUnsubscribe = (id, email) => {
    setConfirm({
      message: `Désabonner ${email} ?`,
      onConfirm: async () => {
        try {
          await unsubscribeSubscriber(id)
          toast.success('Abonné désabonné.')
          load()
        } catch {
          toast.error('Erreur lors du désabonnement.')
        }
      },
    })
  }

  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const params = { search }
      if (filter === 'active')   params.active = '1'
      if (filter === 'inactive') params.active = '0'
      await exportCsv(params)
    } catch {
      toast.error('Erreur lors de l\'export CSV.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className={s.page}>
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}

      <div className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Newsletter</h1>
          <p className={s.pageSub}>{total} abonné{total > 1 ? 's' : ''} dans cet onglet</p>
        </div>
        <button className={s.exportBtn} onClick={handleExport} disabled={exporting}>
          <Download size={14} /> {exporting ? 'Export…' : 'Exporter CSV'}
        </button>
      </div>

      <div className={s.toolbar}>
        <div className={s.tabs}>
          {FILTERS.map(f => (
            <button
              key={f.value}
              className={`${s.tab} ${filter === f.value ? s.tabActive : ''}`}
              onClick={() => { setFilter(f.value); setPage(1) }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className={s.searchWrap}>
          <Search size={14} className={s.searchIcon} />
          <input
            className={s.searchInput}
            placeholder="Rechercher un email…"
            value={searchInput}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <ErrorBanner onRetry={load} />}

      <div className={s.table}>
        <div className={s.tableHead}>
          <span>Email</span>
          <span>Locale</span>
          <span>Statut</span>
          <span>Inscrit le</span>
          <span>Désabonné le</span>
          <span></span>
        </div>

        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <div key={i} className={s.skeleton} />)
        ) : subscribers.length === 0 ? (
          <p className={s.empty}>Aucun abonné dans cette catégorie.</p>
        ) : (
          subscribers.map(sub => (
            <div key={sub.id} className={`${s.row} ${!sub.is_active ? s.rowInactive : ''}`}>
              <span className={s.email}><Mail size={13} />{sub.email}</span>
              <span className={s.locale}>{sub.locale?.toUpperCase() ?? '—'}</span>
              <span className={s.status}>
                {sub.is_active
                  ? <span className={s.badgeActive}>Abonné</span>
                  : <span className={s.badgeInactive}>Désabonné</span>
                }
              </span>
              <span className={s.date}>{formatDate(sub.subscribed_at)}</span>
              <span className={s.date}>{sub.unsubscribed_at ? formatDate(sub.unsubscribed_at) : '—'}</span>
              <span className={s.actions}>
                {sub.is_active && (
                  <button
                    className={s.deleteBtn}
                    onClick={() => handleUnsubscribe(sub.id, sub.email)}
                    aria-label="Désabonner"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </span>
            </div>
          ))
        )}
      </div>

      <Pagination page={page} totalPages={Math.ceil(total / LIMIT)} onPageChange={setPage} />
    </div>
  )
}
