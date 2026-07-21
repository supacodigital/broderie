import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Check, FileText, RefreshCw, Package, Download, Truck, Store,
} from 'lucide-react'
import { getOrderById, updateOrderStatus, downloadInvoice, generateLabel, downloadLabel, updateTracking } from '../../services/orders.service.js'
import { formatCHF } from '../../utils/chf.js'
import { STATUS_CFG } from '../../utils/orderStatus.js'
import s from './OrderDetail.module.css'

const STATUS_OPTIONS = [
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
  const c = STATUS_CFG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6', dot: '#9ca3af' }
  return (
    <span className={s.statusBadge} style={{ color: c.color, background: c.bg }}>
      <span className={s.statusDot} style={{ background: c.dot ?? c.color }} />
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

function formatDateLong(iso) {
  return new Intl.DateTimeFormat('fr-CH', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

// ── Page détail commande ────────────────────────────────────────────────────
export default function OrderDetail() {
  const navigate = useNavigate()
  const { id }    = useParams()
  const orderId   = Number(id)

  const [order,           setOrder]           = useState(null)
  const [loading,         setLoading]         = useState(true)
  const [newStatus,       setNewStatus]       = useState('')
  const [note,            setNote]            = useState('')
  const [saving,          setSaving]          = useState(false)
  const [markingPaid,     setMarkingPaid]     = useState(false)
  const [markingReady,    setMarkingReady]    = useState(false)
  const [generatingLabel, setGeneratingLabel] = useState(false)
  const [trackingInput,   setTrackingInput]   = useState('')
  const [savingTracking,  setSavingTracking]  = useState(false)
  const [feedback,        setFeedback]        = useState('')
  const [error,           setError]           = useState('')

  const load = () => {
    setLoading(true)
    getOrderById(orderId)
      .then(res => {
        setOrder(res)
        setNewStatus(res.status)
      })
      .catch(() => setOrder(null))
      .finally(() => setLoading(false))
    window.dispatchEvent(new Event('admin:data-changed'))
  }

  useEffect(() => { load() }, [orderId])

  const goBack = () => navigate('/commandes')

  const handleStatusUpdate = async () => {
    if (!order || newStatus === order.status) return
    setSaving(true)
    setFeedback('')
    setError('')
    try {
      await updateOrderStatus(orderId, newStatus, note || undefined)
      setOrder(prev => ({ ...prev, status: newStatus }))
      setNote('')
      setFeedback('Statut mis à jour.')
      window.dispatchEvent(new Event('admin:data-changed'))
    } catch {
      setError('Erreur lors de la mise à jour du statut.')
    } finally {
      setSaving(false)
    }
  }

  const handleMarkAsPaid = async () => {
    setMarkingPaid(true)
    setFeedback('')
    setError('')
    try {
      await updateOrderStatus(orderId, 'paid', note || 'Paiement confirmé manuellement')
      setOrder(prev => ({ ...prev, status: 'paid' }))
      setNewStatus('paid')
      setNote('')
      setFeedback('Commande marquée comme payée.')
      window.dispatchEvent(new Event('admin:data-changed'))
    } catch {
      setError('Impossible de marquer la commande comme payée.')
    } finally {
      setMarkingPaid(false)
    }
  }

  const handleMarkReady = async () => {
    setMarkingReady(true)
    setFeedback('')
    setError('')
    try {
      await updateOrderStatus(orderId, 'ready_for_pickup', note || undefined)
      setOrder(prev => ({ ...prev, status: 'ready_for_pickup' }))
      setNewStatus('ready_for_pickup')
      setNote('')
      setFeedback('Commande marquée comme prête. Le client a été prévenu par email.')
      window.dispatchEvent(new Event('admin:data-changed'))
    } catch {
      setError('Impossible de marquer la commande comme prête.')
    } finally {
      setMarkingReady(false)
    }
  }

  const handleDownloadInvoice = async () => {
    try {
      await downloadInvoice(orderId)
    } catch {
      setError('Impossible de télécharger la facture.')
    }
  }

  const handleGenerateLabel = async () => {
    setGeneratingLabel(true)
    setFeedback('')
    setError('')
    try {
      const label = await generateLabel(orderId)
      setOrder(prev => ({ ...prev, tracking_number: label.trackingNumber, label_url: label.labelUrl }))
      setFeedback(`Étiquette générée — suivi : ${label.trackingNumber}`)
      window.dispatchEvent(new Event('admin:data-changed'))
    } catch (err) {
      setError(err.response?.data?.message ?? 'Impossible de générer l\'étiquette. Vérifiez la connexion au serveur.')
    } finally {
      setGeneratingLabel(false)
    }
  }

  const handleDownloadLabel = () => {
    downloadLabel(orderId)
  }

  const handleSaveTracking = async () => {
    if (!trackingInput.trim()) return
    setSavingTracking(true)
    setFeedback('')
    setError('')
    try {
      await updateTracking(orderId, trackingInput.trim())
      setOrder(prev => ({ ...prev, tracking_number: trackingInput.trim() }))
      setTrackingInput('')
      setFeedback('Numéro de suivi enregistré.')
      window.dispatchEvent(new Event('admin:data-changed'))
    } catch {
      setError('Impossible d\'enregistrer le numéro de suivi.')
    } finally {
      setSavingTracking(false)
    }
  }

  const snap = (item) => {
    const parsed = typeof item.product_snapshot_json === 'string'
      ? JSON.parse(item.product_snapshot_json)
      : (item.product_snapshot_json ?? {})
    return parsed
  }

  if (loading) {
    return (
      <div className={s.page}>
        <p className={s.loadingText}>Chargement de la commande…</p>
      </div>
    )
  }

  if (!order) {
    return (
      <div className={s.page}>
        <p className={s.empty}>Commande introuvable.</p>
      </div>
    )
  }

  const needsPaymentAction = ['pending_invoice', 'pending_pickup', 'ready_for_pickup'].includes(order.status)
  const needsPickupPrep    = order.status === 'pending_pickup'

  return (
    <div className={s.page}>
      {/* ── En-tête ── */}
      <div className={s.pageHead}>
        <div className={s.pageHeadLeft}>
          <button className={s.backBtn} onClick={goBack} aria-label="Retour à la liste">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className={s.pageTitle}>Commande #{order.id}</h1>
            <p className={s.pageSubtitle}>{formatDateLong(order.created_at)}</p>
          </div>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {feedback && <div className={s.feedbackOk}>{feedback}</div>}
      {error    && <div className={s.feedbackErr}>{error}</div>}

      {/* ── Grille principale ── */}
      <div className={s.mainGrid}>
        {/* Colonne gauche — informations */}
        <div className={s.leftCol}>

          {/* Résumé */}
          <section className={s.card}>
            <div className={s.cardHead}>
              <div>
                <h2 className={s.cardTitle}>Résumé de la commande</h2>
                <p className={s.cardSub}>Client, adresse et totaux</p>
              </div>
            </div>
            <div className={s.infoGrid}>
              <div className={s.infoBlock}>
                <span className={s.infoLabel}>Client</span>
                <span className={s.infoValue}>{order.first_name} {order.last_name}</span>
                <span className={s.infoSub}>{order.email}</span>
              </div>
              <div className={s.infoBlock}>
                <span className={s.infoLabel}>Adresse de livraison</span>
                {order.shipping_street ? (
                  <>
                    {(order.shipping_first_name || order.shipping_last_name) && (
                      <span className={s.infoValue}>{order.shipping_first_name} {order.shipping_last_name}</span>
                    )}
                    <span className={s.infoValue}>{order.shipping_street} {order.shipping_street_number}</span>
                    <span className={s.infoSub}>
                      {order.shipping_zip} {order.shipping_city}{order.shipping_canton ? ` (${order.shipping_canton})` : ''} — {order.shipping_country}
                    </span>
                  </>
                ) : (
                  <span className={s.infoMissing}>Aucune adresse enregistrée</span>
                )}
              </div>
              {order.billing_street && order.billing_street !== order.shipping_street && (
                <div className={s.infoBlock}>
                  <span className={s.infoLabel}>Adresse de facturation</span>
                  {(order.billing_first_name || order.billing_last_name) && (
                    <span className={s.infoValue}>{order.billing_first_name} {order.billing_last_name}</span>
                  )}
                  <span className={s.infoValue}>{order.billing_street} {order.billing_street_number}</span>
                  <span className={s.infoSub}>
                    {order.billing_zip} {order.billing_city}{order.billing_canton ? ` (${order.billing_canton})` : ''} — {order.billing_country}
                  </span>
                </div>
              )}
              <div className={s.infoBlock}>
                <span className={s.infoLabel}>Sous-total</span>
                <span className={s.infoValue}>{formatCHF(order.subtotal)}</span>
              </div>
              <div className={s.infoBlock}>
                <span className={s.infoLabel}>Livraison</span>
                <span className={s.infoValue}>{formatCHF(order.shipping_cost)}</span>
              </div>
              <div className={s.infoBlock}>
                <span className={s.infoLabel}>TVA incluse</span>
                <span className={s.infoValue}>{formatCHF(order.tax_amount)}</span>
              </div>
              <div className={s.infoBlock}>
                <span className={s.infoLabel}>Total TTC</span>
                <span className={s.infoTotal}>{formatCHF(order.total)}</span>
              </div>
            </div>
          </section>

          {/* Articles */}
          <section className={s.card}>
            <div className={s.cardHead}>
              <div>
                <h2 className={s.cardTitle}>Articles commandés</h2>
                <p className={s.cardSub}>{(order.items ?? []).length} article{(order.items ?? []).length > 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className={s.itemList}>
              {(order.items ?? []).map(item => {
                const p = snap(item)
                const unitPrice    = parseFloat(item.unit_price)
                const comparePrice = p.compare_price_chf ? parseFloat(p.compare_price_chf) : null
                const isDiscounted = comparePrice != null && comparePrice > unitPrice
                return (
                  <div key={item.id} className={s.itemRow}>
                    <div className={s.itemThumb}><Package size={14} /></div>
                    <div className={s.itemInfo}>
                      <span className={s.itemName}>{p.name ?? `Produit #${item.product_id}`}</span>
                      <span className={s.itemSub}>
                        {p.sku && `Réf. ${p.sku} · `}× {item.quantity}
                        {isDiscounted && ` · Promo ${formatCHF(unitPrice)} au lieu de ${formatCHF(comparePrice)}`}
                      </span>
                    </div>
                    <span className={s.itemPrice}>{formatCHF(unitPrice * item.quantity)}</span>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Historique */}
          {(order.history ?? []).length > 0 && (
            <section className={s.card}>
              <div className={s.cardHead}>
                <div>
                  <h2 className={s.cardTitle}>Historique</h2>
                  <p className={s.cardSub}>Statuts précédents</p>
                </div>
              </div>
              <div className={s.historyList}>
                {order.history.map((h, i) => (
                  <div key={i} className={s.historyRow}>
                    <StatusBadge status={h.status} />
                    <span className={s.historyNote}>{h.note}</span>
                    <span className={s.historyDate}>{formatDate(h.created_at)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Colonne droite — actions */}
        <div className={s.rightCol}>

          {/* Paiement */}
          {needsPaymentAction && (
            <section className={s.card}>
              <div className={s.cardHead}>
                <h2 className={s.cardTitle}>Paiement</h2>
              </div>
              <div className={s.actionList}>
                {needsPickupPrep && (
                  <div className={s.actionItem}>
                    <button className={s.btnDark} onClick={handleMarkReady} disabled={markingReady}>
                      {markingReady
                        ? <><RefreshCw size={13} className={s.spin} /> Mise à jour…</>
                        : <><Store size={13} /> Marquer prête pour le retrait</>
                      }
                    </button>
                    <p className={s.actionHint}>Envoie un email au client (adresse + horaires).</p>
                  </div>
                )}
                <div className={s.actionItem}>
                  <button className={s.btnDark} onClick={handleMarkAsPaid} disabled={markingPaid}>
                    {markingPaid
                      ? <><RefreshCw size={13} className={s.spin} /> Mise à jour…</>
                      : <><Check size={13} /> Marquer comme payée</>
                    }
                  </button>
                  <p className={s.actionHint}>
                    {order.status === 'pending_invoice'
                      ? 'Confirme la réception du paiement de la facture QR.'
                      : 'Confirme l\'encaissement au comptoir.'}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Expédition */}
          <section className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>Expédition</h2>
            </div>
            <div className={s.actionList}>
              <div className={s.actionItem}>
                <span className={s.actionLabel}>Étiquette La Poste CH</span>
                <div className={s.actionRow}>
                  <button className={s.btnPrimary} onClick={handleGenerateLabel} disabled={generatingLabel}>
                    {generatingLabel
                      ? <><RefreshCw size={13} className={s.spin} /> Génération…</>
                      : <><Package size={13} /> Générer</>
                    }
                  </button>
                  {order.label_url && (
                    <button className={s.btnGhost} onClick={handleDownloadLabel}>
                      <Download size={13} />
                    </button>
                  )}
                </div>
                {order.tracking_number && (
                  <p className={s.trackingCurrent}>
                    <Truck size={12} /> <strong>{order.tracking_number}</strong>
                  </p>
                )}
              </div>
              <div className={s.actionItem}>
                <span className={s.actionLabel}>Suivi manuel</span>
                <div className={s.actionRow}>
                  <input
                    type="text"
                    className={s.input}
                    placeholder="99.00.123456.78901234"
                    value={trackingInput}
                    onChange={e => setTrackingInput(e.target.value.trim())}
                    onKeyDown={e => e.key === 'Enter' && handleSaveTracking()}
                  />
                  <button className={s.btnGhost} onClick={handleSaveTracking} disabled={savingTracking || !trackingInput.trim()}>
                    {savingTracking ? <RefreshCw size={13} className={s.spin} /> : <Check size={13} />}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Facture */}
          <section className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>Facture</h2>
            </div>
            <div className={s.actionList}>
              <div className={s.actionItem}>
                <button className={`${s.btnGhost} ${s.btnFull}`} onClick={handleDownloadInvoice}>
                  <FileText size={13} /> Télécharger la facture PDF
                </button>
              </div>
            </div>
          </section>

          {/* Changer le statut */}
          <section className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>Changer le statut</h2>
            </div>
            <div className={s.actionList}>
              <div className={s.actionItem}>
                <select className={s.select} value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                  {STATUS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <textarea
                  className={s.textarea}
                  placeholder="Note interne (optionnel)"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={2}
                />
                <button className={`${s.btnPrimary} ${s.btnFull}`} onClick={handleStatusUpdate} disabled={saving || newStatus === order.status}>
                  {saving ? <RefreshCw size={13} className={s.spin} /> : 'Enregistrer'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
