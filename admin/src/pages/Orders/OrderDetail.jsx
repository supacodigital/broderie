import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ConfirmDialog from '../../components/ui/ConfirmDialog/ConfirmDialog.jsx'
import {
  ArrowLeft, Check, FileText, RefreshCw, Package, Download, Truck, Store, QrCode, ExternalLink,
  Printer,
} from 'lucide-react'
import { getOrderById, updateOrderStatus, downloadInvoice, generateLabel, downloadLabel, updateTracking, sendTwintQr } from '../../services/orders.service.js'
import { formatCHF } from '../../utils/chf.js'
import { STATUS_CFG } from '../../utils/orderStatus.js'
import { formatCustomerNumber } from '../../utils/customerNumber.js'
import s from './OrderDetail.module.css'

const STATUS_OPTIONS = [
  { value: 'pending',          label: 'En attente' },
  { value: 'awaiting_payment', label: 'En attente de paiement' },
  // Posé uniquement par Stripe : visible dans la liste, pas choisissable à la main
  { value: 'payment_failed',   label: 'Paiement refusé', disabled: true },
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
  const [confirm,         setConfirm]         = useState(null)
  const [markingPaid,     setMarkingPaid]     = useState(false)
  const [markingReady,    setMarkingReady]    = useState(false)
  const [sendingTwintQr,  setSendingTwintQr]  = useState(false)
  const [generatingLabel, setGeneratingLabel] = useState(false)
  const [trackingInput,   setTrackingInput]   = useState('')
  const [savingTracking,  setSavingTracking]  = useState(false)
  const [feedback,        setFeedback]        = useState('')
  const [error,           setError]           = useState('')

  const load = () => {
    setLoading(true)
    setNote('')
    setTrackingInput('')
    setFeedback('')
    setError('')
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

  /* Retour en remontant l'historique : les filtres de la liste vivent dans son
     URL, et un navigate('/commandes') sec les effaçait — on revenait sur la liste
     complète après chaque commande traitée. Repli sur l'URL nue quand il n'y a
     pas d'historique (lien direct, nouvel onglet). */
  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/commandes')
  }

  /* Statuts qui déclenchent un envoi au client. « Expédiée » génère en plus une
     vraie étiquette Swiss Post (prestation facturée). Ces actions sont
     irréversibles : un mauvais choix dans la liste déroulante envoyait le mail
     sans le moindre avertissement. */
  const STATUS_SIDE_EFFECTS = {
    shipped:          'Un email d’expédition sera envoyé au client, et une étiquette Swiss Post sera générée.',
    ready_for_pickup: 'Un email « votre commande est prête » sera envoyé au client.',
  }

  const runStatusUpdate = async () => {
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

  /* Demande confirmation uniquement quand le changement part chez le client :
     les statuts internes (en préparation, annulée…) restent immédiats, pour ne
     pas transformer chaque clic en dialogue. */
  const handleStatusUpdate = () => {
    if (!order || newStatus === order.status) return
    const sideEffect = STATUS_SIDE_EFFECTS[newStatus]
    if (sideEffect) {
      const label = STATUS_OPTIONS.find(o => o.value === newStatus)?.label ?? newStatus
      setConfirm({
        message: `Passer la commande #${order.id} en « ${label} » ? ${sideEffect}`,
        onConfirm: runStatusUpdate,
      })
      return
    }
    runStatusUpdate()
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

  const runMarkReady = async () => {
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

  /* Même garde que pour le select : ce bouton prévient le client par email. */
  const handleMarkReady = () => {
    setConfirm({
      message: `Marquer la commande #${order.id} comme prête ? ${STATUS_SIDE_EFFECTS.ready_for_pickup}`,
      onConfirm: runMarkReady,
    })
  }

  const handleSendTwintQr = async () => {
    setSendingTwintQr(true)
    setFeedback('')
    setError('')
    try {
      await sendTwintQr(orderId)
      setFeedback('QR Twint envoyé par email au client.')
    } catch (err) {
      setError(err.response?.data?.message ?? 'Impossible d\'envoyer le QR Twint.')
    } finally {
      setSendingTwintQr(false)
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
  // Twint QR utile tant que la commande n'est pas encore payée (avant même la
  // facture) — plage plus large que needsPaymentAction, qui cible surtout la
  // préparation/le retrait.
  const canSendTwintQr = ['pending', 'awaiting_payment', 'payment_failed', 'pending_invoice', 'pending_pickup'].includes(order.status)

  return (
    <div className={s.page}>
      {confirm && <ConfirmDialog {...confirm} danger={false} onClose={() => setConfirm(null)} />}

      {/* ── En-tête ── */}
      <div className={s.pageHead}>
        <div className={s.pageHeadLeft}>
          <button className={s.backBtn} onClick={goBack} aria-label="Retour à la liste">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className={s.pageTitle}>Commande #{order.id}</h1>
            <p className={s.pageSubtitle}>
              {formatDateLong(order.created_at)}
              {/* Le n° de facture est la référence que le client cite au
                  téléphone : il doit être lisible sans ouvrir le PDF. */}
              {order.invoice_number && (
                <>
                  <span className={s.subSep}>·</span>
                  <span className={s.invoiceRef}>Facture {order.invoice_number}</span>
                </>
              )}
            </p>
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

            {/* Demande de facture imprimée — encart plutôt qu'une ligne du tableau :
                c'est une action manuelle à faire avant d'expédier le colis. */}
            {!!order.wants_printed_invoice && (
              <div className={s.printedInvoiceNotice}>
                <Printer size={16} aria-hidden="true" />
                <div>
                  <strong>Facture imprimée demandée</strong>
                  <span>La cliente souhaite une facture papier jointe au colis.</span>
                </div>
              </div>
            )}

            <div className={s.infoGrid}>
              <div className={s.infoBlock}>
                <span className={s.infoLabel}>Client</span>
                <span className={s.infoValue}>{order.first_name} {order.last_name}</span>
                <span className={s.infoSub}>{order.email}</span>
                {/* Numéro imprimé sur la facture (ADM-17) */}
                {order.user_id && <span className={s.infoSub}>N° client {formatCustomerNumber(order.user_id)}</span>}
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
                    {order.shipping_phone && (
                      <a className={s.infoSub} href={`tel:${order.shipping_phone.replace(/\s+/g, '')}`}>
                        Tél. {order.shipping_phone}
                      </a>
                    )}
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
          {(needsPaymentAction || canSendTwintQr) && (
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
                {needsPaymentAction && (
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
                )}
                {canSendTwintQr && (
                  <div className={s.actionItem}>
                    <button className={s.btnDark} onClick={handleSendTwintQr} disabled={sendingTwintQr}>
                      {sendingTwintQr
                        ? <><RefreshCw size={13} className={s.spin} /> Envoi…</>
                        : <><QrCode size={13} /> Envoyer un QR Twint par email</>
                      }
                    </button>
                    <p className={s.actionHint}>
                      Génère un QR code de paiement Twint (valable 24h) et l'envoie au client par email.
                    </p>
                  </div>
                )}
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
                    <a
                      href={`https://www.post.ch/fr/outils/suivi-de-colis?track=${encodeURIComponent(order.tracking_number)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={s.trackingLink}
                    >
                      Voir le suivi <ExternalLink size={11} />
                    </a>
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
                    <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
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
