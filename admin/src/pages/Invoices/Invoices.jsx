import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Search } from 'lucide-react'
import { getInvoices, exportInvoicesCsv } from '../../services/invoices.service.js'
import { formatDate } from '../../utils/date.js'
import { formatCHF } from '../../utils/chf.js'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import Pagination from '../../components/ui/Pagination/Pagination.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import { useDebounceSearch } from '../../hooks/useDebounceSearch.js'
import s from './Invoices.module.css'

/* Suivi des factures QR (ADM-09) — payées, à payer, en retard.
   Une facture est payée dès qu'un paiement a été enregistré (« Marquer comme
   payée ») : c'est vrai même si la commande a été expédiée avant. L'export
   porte la référence QR, celle que la banque indique en face de chaque
   virement, pour pointer le relevé. */

const LIMIT = 25

const FILTERS = [
  { value: 'unpaid',  label: 'À payer'   },
  { value: 'overdue', label: 'En retard' },
  { value: 'paid',    label: 'Payées'    },
  { value: 'all',     label: 'Toutes'    },
]

// « 00 00000 00000 00002 02600 00094 » — lisible comme sur le bulletin
const formatReference = (ref) => (/^\d{27}$/.test(ref ?? '')
  ? `${ref.slice(0, 2)} ${ref.slice(2).match(/.{1,5}/g).join(' ')}`
  : ref || '—')

export default function Invoices() {
  const navigate = useNavigate()
  const toast = useToast()
  const [filter,    setFilter]    = useState('unpaid')
  const [page,      setPage]      = useState(1)
  const [invoices,  setInvoices]  = useState([])
  const [counts,    setCounts]    = useState({})
  const [dueDays,   setDueDays]   = useState(30)
  const [totalPages, setTotalPages] = useState(1)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(false)
  const [exporting, setExporting] = useState(false)
  // Recherche : n° de facture, cliente, e-mail, référence QR (relevé bancaire)
  const { search: searchInput, debouncedSearch: search, handleSearch } = useDebounceSearch(300, () => setPage(1))

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await getInvoices({ status: filter, page, limit: LIMIT, q: search || undefined })
      setInvoices(res.data)
      setCounts(res.counts)
      setDueDays(res.dueDays)
      setTotalPages(res.pagination.totalPages ?? 1)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [filter, page, search])

  useEffect(() => { load() }, [load])

  const changeFilter = (value) => { setFilter(value); setPage(1) }

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportInvoicesCsv(filter)
    } catch {
      toast.error('L’export n’a pas pu être généré.')
    } finally {
      setExporting(false)
    }
  }

  const statusBadge = (inv) => {
    if (inv.paymentStatus === 'paid') {
      return <span className={s.badgePaid}>Payée le {formatDate(inv.paidAt)}</span>
    }
    if (inv.paymentStatus === 'overdue') {
      return <span className={s.badgeOverdue}>En retard · {inv.daysOverdue} j</span>
    }
    return <span className={s.badgeUnpaid}>À payer</span>
  }

  return (
    <div className={s.page}>
      <div className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Factures</h1>
          <p className={s.pageSub}>
            Factures QR payées, à payer et en retard — échéance à {dueDays} jours (Paramètres → Facturation).
          </p>
        </div>
        <button className={s.exportBtn} onClick={handleExport} disabled={exporting}>
          <Download size={14} />
          {exporting ? 'Export…' : 'Exporter (CSV)'}
        </button>
      </div>

      <div className={s.summary}>
        <span className={s.summaryLabel}>Reste à encaisser</span>
        <strong className={s.summaryValue}>{formatCHF(counts.outstanding ?? 0)}</strong>
        {counts.overdue > 0 && <span className={s.summaryWarn}>dont {counts.overdue} facture{counts.overdue > 1 ? 's' : ''} en retard</span>}
      </div>

      <div className={s.searchWrap}>
        <Search size={14} className={s.searchIcon} aria-hidden="true" />
        <input
          type="search"
          className={s.searchInput}
          placeholder="N° de facture, cliente, e-mail ou référence QR…"
          aria-label="Rechercher une facture"
          value={searchInput}
          onChange={e => handleSearch(e.target.value)}
        />
      </div>

      <div className={s.tabs} role="tablist" aria-label="Filtrer les factures">
        {FILTERS.map(f => (
          <button
            key={f.value}
            role="tab"
            aria-selected={filter === f.value}
            className={`${s.tab} ${filter === f.value ? s.tabActive : ''}`}
            onClick={() => changeFilter(f.value)}
          >
            {f.label}
            <span className={s.tabCount}>{counts[f.value] ?? 0}</span>
          </button>
        ))}
      </div>

      {error && <ErrorBanner onRetry={load} />}

      <div className={s.table}>
        <div className={s.tableHead}>
          <span>N° facture</span>
          <span>Cliente</span>
          <span>Date</span>
          <span>Échéance</span>
          <span className={s.right}>Montant</span>
          <span>Paiement</span>
          <span>Référence QR</span>
        </div>

        {loading ? (
          [1, 2, 3, 4].map(i => <div key={i} className={s.skeleton} />)
        ) : invoices.length === 0 ? (
          <p className={s.empty}>{search ? 'Aucune facture ne correspond à cette recherche.' : 'Aucune facture dans cette liste.'}</p>
        ) : invoices.map(inv => (
          <button
            key={inv.orderId}
            type="button"
            className={s.row}
            onClick={() => navigate(`/commandes/${inv.orderId}`)}
            title={`Ouvrir la commande #${inv.orderId}`}
          >
            <span className={s.number}>{inv.invoiceNumber ?? `Commande #${inv.orderId}`}</span>
            <span className={s.customer}>
              {inv.customer || '—'}
              <span className={s.muted}>{inv.email}</span>
            </span>
            <span className={s.muted}>{formatDate(inv.createdAt)}</span>
            <span className={s.muted}>{formatDate(inv.dueDate)}</span>
            <span className={`${s.right} ${s.amount}`}>{formatCHF(inv.total)}</span>
            <span>{statusBadge(inv)}</span>
            <span className={s.reference}>{formatReference(inv.qrReference)}</span>
          </button>
        ))}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  )
}
