import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Package, ChevronRight } from 'lucide-react'
import { getMyOrders } from '../../services/orders.service.js'
import Pagination from '../../components/ui/Pagination/Pagination.jsx'
import { roundCHF } from '../../utils/chf.js'
import { formatDate } from '../../utils/date.js'
import { STATUS_CFG } from '../../utils/orderStatus.js'
import { orderNumber } from '../../utils/orderNumber.js'
import s from './Account.module.css'

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span className={s.statusBadge} style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  )
}

/* Champ mot de passe accessible — label, bouton afficher/masquer, description et erreur reliés via aria-describedby */
/* Nombre de commandes par page dans l'onglet « Mes commandes » */
const PAGE_SIZE = 20

/* ── Section Commandes — tableau ── */
export default function OrdersPage() {
  const navigate = useNavigate()
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)
  /* `error` distinct de la liste vide : un échec réseau ou une session expirée
     affichait « Aucune commande », laissant croire que les commandes avaient disparu. */
  const [error,      setError]      = useState(false)
  const [page,       setPage]       = useState(1)
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })

  const loadOrders = useCallback((targetPage) => {
    let cancelled = false
    setLoading(true)
    setError(false)
    getMyOrders({ page: targetPage, limit: PAGE_SIZE })
      .then(d => {
        if (cancelled) return
        setOrders(d.data ?? [])
        setPagination(d.pagination ?? { page: targetPage, totalPages: 1, total: d.data?.length ?? 0 })
      })
      .catch(() => { if (!cancelled) { setOrders([]); setError(true) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => loadOrders(page), [page, loadOrders])

  if (loading) {
    return (
      <section className={s.panel}>
        <h2 className={s.panelTitle}>Mes commandes</h2>
        <div className={s.skeletonList}>
          {[1,2,3].map(i => <div key={i} className={s.skeletonRow} />)}
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className={s.panel}>
        <h2 className={s.panelTitle}>Mes commandes</h2>
        <div className={s.emptyState}>
          <Package size={40} className={s.emptyIcon} />
          <p className={s.emptyTitle}>Impossible d'afficher vos commandes</p>
          <p className={s.emptyDesc}>La connexion au serveur a échoué. Vos commandes ne sont pas perdues.</p>
          <button type="button" className={s.btnPrimary} onClick={() => loadOrders(page)}>Réessayer</button>
        </div>
      </section>
    )
  }

  if (!orders.length) {
    return (
      <section className={s.panel}>
        <h2 className={s.panelTitle}>Mes commandes</h2>
        <div className={s.emptyState}>
          <Package size={40} className={s.emptyIcon} />
          <p className={s.emptyTitle}>Aucune commande</p>
          <p className={s.emptyDesc}>Vous n'avez pas encore passé de commande.</p>
          <Link to="/catalogue" className={s.btnPrimary}>Découvrir le catalogue</Link>
        </div>
      </section>
    )
  }

  return (
    <section className={s.panel}>
      {/* Compteur global, pas le nombre de lignes de la page courante */}
      <h2 className={s.panelTitle}>Mes commandes <span className={s.countBadge}>{pagination.total ?? orders.length}</span></h2>
      <table className={s.dataTable}>
        <thead>
          <tr>
            <th>Commande</th>
            <th>Date</th>
            <th>Articles</th>
            <th>Total</th>
            <th>Statut</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id} className={s.dataRow} onClick={() => navigate(`/commandes/${o.id}`)}>
              <td className={s.dataRowStrong}>{orderNumber(o)}</td>
              <td className={s.dataRowMuted}>{formatDate(o.created_at)}</td>
              <td className={s.dataRowMuted}>{o.items_count} article{o.items_count > 1 ? 's' : ''}</td>
              <td className={s.dataRowStrong}>CHF {roundCHF(o.total).toFixed(2)}</td>
              <td><StatusBadge status={o.status} /></td>
              <td>
                <Link to={`/commandes/${o.id}`} className={s.orderDetailBtn} onClick={e => e.stopPropagation()}>
                  Détail <ChevronRight size={13} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Au-delà d'une page, les commandes plus anciennes étaient inaccessibles */}
      <Pagination
        page={pagination.page ?? page}
        totalPages={pagination.totalPages ?? 1}
        onChange={setPage}
      />
    </section>
  )
}
