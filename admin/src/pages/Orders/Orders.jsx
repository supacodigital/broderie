import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Eye, ChevronLeft, ChevronRight, Search,
  Send, FileText, RefreshCw,
} from 'lucide-react'
import { getOrders, getOrderById, updateOrderStatus, sendTwintQr, downloadInvoice } from '../../services/orders.service.js'
import { roundCHF } from '../../utils/chf.js'
import { STATUS_CFG } from '../../utils/orderStatus.js'
import s from './Orders.module.css'

const LIMIT = 20

const STATUS_OPTIONS = [
  { value: '',                label: 'Tous les statuts' },
  { value: 'pending',         label: 'En attente' },
  { value: 'awaiting_payment',label: 'Att. paiement' },
  { value: 'paid',            label: 'Payée' },
  { value: 'processing',      label: 'En préparation' },
  { value: 'shipped',         label: 'Expédiée' },
  { value: 'delivered',       label: 'Livrée' },
  { value: 'cancelled',       label: 'Annulée' },
  { value: 'refunded',        label: 'Remboursée' },
]

const PAYMENT_LABELS = {
  invoice: '📄 Facture',
  twint:   '📱 Twint',
  card:    '💳 Carte',
}


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
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

function formatDateLong(iso) {
  return new Intl.DateTimeFormat('fr-CH', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

/* ── Modal détail commande ── */
function OrderModal({ orderId, onClose, onUpdated }) {
  const [order,       setOrder]       = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [newStatus,   setNewStatus]   = useState('')
  const [note,        setNote]        = useState('')
  const [saving,      setSaving]      = useState(false)
  const [sendingQr,   setSendingQr]   = useState(false)
  const [feedback,    setFeedback]    = useState('')
  const [error,       setError]       = useState('')

  useEffect(() => {
    setLoading(true)
    getOrderById(orderId)
      .then(res => {
        const o = res.data
        setOrder(o)
        setNewStatus(o.status)
      })
      .catch(() => setOrder(null))
      .finally(() => setLoading(false))
  }, [orderId])

  const handleStatusUpdate = async () => {
    if (newStatus === order.status) return
    setSaving(true)
    setFeedback('')
    setError('')
    try {
      await updateOrderStatus(orderId, newStatus, note || undefined)
      setOrder(prev => ({ ...prev, status: newStatus }))
      setNote('')
      setFeedback('Statut mis à jour.')
      onUpdated?.()
    } catch {
      setError('Erreur lors de la mise à jour du statut.')
    } finally {
      setSaving(false)
    }
  }

  const handleSendTwintQr = async () => {
    setSendingQr(true)
    setFeedback('')
    setError('')
    try {
      await sendTwintQr(orderId)
      setFeedback('QR Twint envoyé par email au client.')
    } catch {
      setError('Impossible d\'envoyer le QR Twint.')
    } finally {
      setSendingQr(false)
    }
  }

  const handleDownloadInvoice = async () => {
    try {
      await downloadInvoice(orderId)
    } catch {
      setError('Impossible de télécharger la facture.')
    }
  }

  const snap = (item) => {
    const s = typeof item.product_snapshot_json === 'string'
      ? JSON.parse(item.product_snapshot_json)
      : (item.product_snapshot_json ?? {})
    return s
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.modalHead}>
          <div>
            <h2 className={s.modalTitle}>Commande #{orderId}</h2>
            {order && <p className={s.modalSub}>{formatDateLong(order.created_at)}</p>}
          </div>
          <button className={s.closeBtn} onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        {loading ? (
          <div className={s.modalLoading}><div className={s.spinner} /></div>
        ) : !order ? (
          <p className={s.empty}>Commande introuvable.</p>
        ) : (
          <div className={s.modalBody}>

            {/* Infos client + adresse + totaux */}
            <div className={s.infoGrid}>
              <div className={s.infoBlock}>
                <span className={s.infoLabel}>Client</span>
                <span className={s.infoValue}>{order.first_name} {order.last_name}</span>
                <span className={s.infoSub}>{order.email}</span>
              </div>
              <div className={s.infoBlock}>
                <span className={s.infoLabel}>Adresse de livraison</span>
                {order.street ? (
                  <>
                    <span className={s.infoValue}>{order.street}</span>
                    <span className={s.infoSub}>{order.zip} {order.city}{order.canton ? ` (${order.canton})` : ''} — {order.country}</span>
                  </>
                ) : (
                  <span className={s.infoMissing}>Aucune adresse enregistrée</span>
                )}
              </div>
              <div className={s.infoBlock}>
                <span className={s.infoLabel}>Statut actuel</span>
                <StatusBadge status={order.status} />
              </div>
              <div className={s.infoBlock}>
                <span className={s.infoLabel}>Sous-total</span>
                <span className={s.infoValue}>CHF {roundCHF(parseFloat(order.subtotal)).toFixed(2)}</span>
              </div>
              <div className={s.infoBlock}>
                <span className={s.infoLabel}>Livraison</span>
                <span className={s.infoValue}>CHF {roundCHF(parseFloat(order.shipping_cost)).toFixed(2)}</span>
              </div>
              <div className={s.infoBlock}>
                <span className={s.infoLabel}>TVA incluse</span>
                <span className={s.infoValue}>CHF {roundCHF(parseFloat(order.tax_amount)).toFixed(2)}</span>
              </div>
              <div className={s.infoBlock}>
                <span className={s.infoLabel}>Total TTC</span>
                <span className={s.infoTotal}>CHF {roundCHF(parseFloat(order.total)).toFixed(2)}</span>
              </div>
            </div>

            {/* Articles */}
            <h3 className={s.sectionTitle}>Articles</h3>
            <div className={s.itemsList}>
              {(order.items ?? []).map(item => {
                const p = snap(item)
                return (
                  <div key={item.id} className={s.itemRow}>
                    <div className={s.itemInfo}>
                      <span className={s.itemName}>{p.name ?? `Produit #${item.product_id}`}</span>
                      {p.sku && <span className={s.itemSku}>Réf. {p.sku}</span>}
                    </div>
                    <span className={s.itemQty}>× {item.quantity}</span>
                    <span className={s.itemPrice}>CHF {roundCHF(parseFloat(item.unit_price) * item.quantity).toFixed(2)}</span>
                  </div>
                )
              })}
            </div>

            {/* Historique */}
            {(order.history ?? []).length > 0 && (
              <>
                <h3 className={s.sectionTitle}>Historique</h3>
                <div className={s.history}>
                  {order.history.map((h, i) => (
                    <div key={i} className={s.historyRow}>
                      <StatusBadge status={h.status} />
                      <span className={s.historyNote}>{h.note}</span>
                      <span className={s.historyDate}>{formatDate(h.created_at)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Actions */}
            <h3 className={s.sectionTitle}>Actions</h3>

            {feedback && <p className={s.feedbackOk}>{feedback}</p>}
            {error    && <p className={s.feedbackErr}>{error}</p>}

            {/* Changement statut */}
            <div className={s.actionBlock}>
              <label className={s.infoLabel}>Changer le statut</label>
              <div className={s.statusRow}>
                <select
                  className={s.select}
                  value={newStatus}
                  onChange={e => setNewStatus(e.target.value)}
                >
                  {STATUS_OPTIONS.slice(1).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <button
                  className={s.btnSave}
                  onClick={handleStatusUpdate}
                  disabled={saving || newStatus === order.status}
                >
                  {saving ? <RefreshCw size={13} className={s.spin} /> : 'Enregistrer'}
                </button>
              </div>
              <textarea
                className={s.noteInput}
                placeholder="Note interne (optionnel) — ex : numéro de suivi Swiss Post"
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={2}
              />
              <p className={s.noteHint}>
                Pour l'expédition, insérez le numéro de suivi dans la note — l'email au client l'inclura automatiquement.
              </p>
            </div>

            {/* Envoi QR Twint */}
            {['pending', 'awaiting_payment'].includes(order.status) && (
              <div className={s.actionBlock}>
                <label className={s.infoLabel}>Paiement Twint</label>
                <button
                  className={s.btnTwint}
                  onClick={handleSendTwintQr}
                  disabled={sendingQr}
                >
                  {sendingQr
                    ? <><RefreshCw size={13} className={s.spin} /> Envoi en cours…</>
                    : <><Send size={13} /> Envoyer QR Twint par email</>
                  }
                </button>
                <p className={s.noteHint}>Génère un nouveau QR Twint et l'envoie au client par email (valable 1h).</p>
              </div>
            )}

            {/* Télécharger la facture */}
            <div className={s.actionBlock}>
              <label className={s.infoLabel}>Facture</label>
              <button
                className={s.btnSecondary}
                onClick={handleDownloadInvoice}
              >
                <FileText size={13} /> Télécharger la facture PDF
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}

/* ── Page principale ── */
export default function Orders() {
  const [orders,       setOrders]       = useState([])
  const [total,        setTotal]        = useState(0)
  const [searchParams, setSearchParams] = useSearchParams()
  const [page,         setPage]         = useState(1)
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') ?? '')
  const [search,       setSearch]       = useState('')
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(false)
  const [selectedId,   setSelectedId]   = useState(() => {
    const open = searchParams.get('open')
    return open ? parseInt(open, 10) : null
  })

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: LIMIT, sort: 'created_at', order: 'desc' })
      if (statusFilter) params.set('status', statusFilter)
      if (search)       params.set('q', search)
      const res = await getOrders(Object.fromEntries(params))
      setOrders(res.data ?? [])
      setTotal(res.pagination?.total ?? 0)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, search])

  useEffect(() => { load() }, [load])

  /* Applique le filtre status si on arrive depuis le dashboard avec ?status= */
  useEffect(() => {
    const s = searchParams.get('status')
    if (s !== null) setStatusFilter(s)
  }, [searchParams])

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className={s.page}>
      {selectedId && (
        <OrderModal
          orderId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={load}
        />
      )}

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
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select
          className={s.select}
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button className={s.refreshBtn} onClick={load} aria-label="Rafraîchir">
          <RefreshCw size={14} />
        </button>
      </div>

      {error && (
        <div className={s.errorBanner}>
          Erreur de chargement. <button className={s.retryBtn} onClick={load}>Réessayer</button>
        </div>
      )}

      <div className={s.card}>
        <div className={s.tableHead}>
          <span>#</span>
          <span>Client</span>
          <span>Date</span>
          <span>Total</span>
          <span>Statut</span>
          <span></span>
        </div>

        {loading ? (
          <div className={s.loadingRows}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className={s.skeletonRow}>
                {[...Array(6)].map((_, j) => <span key={j} />)}
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <p className={s.empty}>Aucune commande trouvée.</p>
        ) : (
          orders.map(order => (
            <div key={order.id} className={s.tableRow} onClick={() => setSelectedId(order.id)}>
              <span className={s.orderId}>#{order.id}</span>
              <div className={s.customerCell}>
                <span className={s.customerName}>{order.first_name} {order.last_name}</span>
                <span className={s.customerEmail}>{order.email}</span>
              </div>
              <span className={s.muted}>{formatDate(order.created_at)}</span>
              <span className={s.bold}>CHF {roundCHF(order.total).toFixed(2)}</span>
              <StatusBadge status={order.status} />
              <button
                className={s.iconBtn}
                onClick={e => { e.stopPropagation(); setSelectedId(order.id) }}
                aria-label="Voir le détail"
              >
                <Eye size={15} />
              </button>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className={s.pagination}>
          <button className={s.pageBtn} disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={16} />
          </button>
          <span className={s.pageInfo}>Page {page} / {totalPages}</span>
          <button className={s.pageBtn} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
