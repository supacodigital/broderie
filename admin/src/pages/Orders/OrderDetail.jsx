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

  // Facture QR / Click & Collect : l'admin confirme manuellement la réception du paiement
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

  // Click & Collect : la commande est prête → email automatique au client
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
      <div className={s.body}>

        {feedback && <p className={s.feedbackOk}>{feedback}</p>}
        {error    && <p className={s.feedbackErr}>{error}</p>}

        {/* 1 — Résumé : client, adresse, articles, totaux — tout en tableau */}
        <section className={s.section}>
          <h2 className={s.sectionTitle}>Résumé de la commande</h2>
          <table className={s.summaryTable}>
            <tbody>
              <tr>
                <th className={s.summaryLabel}>Client</th>
                <td className={s.summaryValue}>
                  {order.first_name} {order.last_name}
                  <span className={s.summarySub}>{order.email}</span>
                </td>
              </tr>
              <tr>
                <th className={s.summaryLabel}>Adresse de livraison</th>
                <td className={s.summaryValue}>
                  {order.street ? (
                    <>
                      {(order.shipping_first_name || order.shipping_last_name) && (
                        <>{order.shipping_first_name} {order.shipping_last_name}<br /></>
                      )}
                      {order.street}
                      <span className={s.summarySub}>
                        {order.zip} {order.city}{order.canton ? ` (${order.canton})` : ''} — {order.country}
                      </span>
                    </>
                  ) : (
                    <span className={s.infoMissing}>Aucune adresse enregistrée</span>
                  )}
                </td>
              </tr>
              {/* Adresse de facturation — affichée uniquement si distincte de la livraison */}
              {order.billing_street && order.billing_street !== order.street && (
                <tr>
                  <th className={s.summaryLabel}>Adresse de facturation</th>
                  <td className={s.summaryValue}>
                    {(order.billing_first_name || order.billing_last_name) && (
                      <>{order.billing_first_name} {order.billing_last_name}<br /></>
                    )}
                    {order.billing_street}
                    <span className={s.summarySub}>
                      {order.billing_zip} {order.billing_city}{order.billing_canton ? ` (${order.billing_canton})` : ''} — {order.billing_country}
                    </span>
                  </td>
                </tr>
              )}
              <tr>
                <th className={s.summaryLabel}>Statut actuel</th>
                <td className={s.summaryValue}><StatusBadge status={order.status} /></td>
              </tr>

              {/* Articles commandés — lignes intégrées au tableau résumé */}
              <tr className={s.summarySectionRow}>
                <th colSpan={2} className={s.summarySectionLabel}>Articles commandés</th>
              </tr>
              {(order.items ?? []).map(item => {
                const p = snap(item)
                const unitPrice   = parseFloat(item.unit_price)
                const comparePrice = p.compare_price_chf ? parseFloat(p.compare_price_chf) : null
                const isDiscounted = comparePrice != null && comparePrice > unitPrice
                return (
                  <tr key={item.id}>
                    <th className={s.summaryLabel}>
                      {p.name ?? `Produit #${item.product_id}`}
                      {p.sku && <span className={s.summarySub}>Réf. {p.sku}</span>}
                    </th>
                    <td className={s.summaryValue}>
                      × {item.quantity} — {formatCHF(unitPrice * item.quantity)}
                      {isDiscounted && (
                        <span className={s.summarySub}>
                          Prix promo : {formatCHF(unitPrice)}/pièce au lieu de {formatCHF(comparePrice)}/pièce
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}

              <tr className={s.summarySectionRow}>
                <th colSpan={2} className={s.summarySectionLabel}>Totaux</th>
              </tr>
              <tr>
                <th className={s.summaryLabel}>Sous-total</th>
                <td className={s.summaryValue}>{formatCHF(order.subtotal)}</td>
              </tr>
              <tr>
                <th className={s.summaryLabel}>Livraison</th>
                <td className={s.summaryValue}>{formatCHF(order.shipping_cost)}</td>
              </tr>
              <tr>
                <th className={s.summaryLabel}>TVA incluse</th>
                <td className={s.summaryValue}>{formatCHF(order.tax_amount)}</td>
              </tr>
              <tr>
                <th className={s.summaryLabel}>Total TTC</th>
                <td className={s.summaryTotal}>{formatCHF(order.total)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 3 — Gestion de la commande : paiement, expédition, facture, statut, historique — un seul tableau */}
        <section className={s.section}>
          <h2 className={s.sectionTitle}>Gestion de la commande</h2>
          <table className={s.summaryTable}>
            <tbody>

              {/* Paiement — uniquement si une action de paiement est possible sur ce statut */}
              {needsPaymentAction && (
                <>
                  <tr className={s.summarySectionRow}>
                    <th colSpan={2} className={s.summarySectionLabel}>Paiement</th>
                  </tr>
                  {needsPickupPrep && (
                    <tr>
                      <th className={s.summaryLabel}>Préparation du retrait</th>
                      <td className={s.summaryValue}>
                        <button
                          className={s.btnTwint}
                          onClick={handleMarkReady}
                          disabled={markingReady}
                        >
                          {markingReady
                            ? <><RefreshCw size={13} className={s.spin} /> Mise à jour…</>
                            : <><Store size={13} /> Marquer prête pour le retrait</>
                          }
                        </button>
                        <p className={s.noteHint}>
                          Passe la commande au statut « Prête pour le retrait » et envoie automatiquement un email au client (adresse + horaires de la boutique).
                        </p>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <th className={s.summaryLabel}>
                      {order.status === 'pending_invoice' ? 'Paiement de la facture' : 'Paiement en boutique'}
                    </th>
                    <td className={s.summaryValue}>
                      <button
                        className={s.btnTwint}
                        onClick={handleMarkAsPaid}
                        disabled={markingPaid}
                      >
                        {markingPaid
                          ? <><RefreshCw size={13} className={s.spin} /> Mise à jour…</>
                          : <><Check size={13} /> Marquer comme payée</>
                        }
                      </button>
                      <p className={s.noteHint}>
                        {order.status === 'pending_invoice'
                          ? 'Confirme la réception du paiement de la facture QR et passe la commande au statut « Payée ».'
                          : 'Confirme l\'encaissement au comptoir et passe la commande au statut « Payée ».'}
                      </p>
                    </td>
                  </tr>
                </>
              )}

              {/* Expédition */}
              <tr className={s.summarySectionRow}>
                <th colSpan={2} className={s.summarySectionLabel}>Expédition</th>
              </tr>
              <tr>
                <th className={s.summaryLabel}>Étiquette La Poste CH</th>
                <td className={s.summaryValue}>
                  <div className={s.labelRow}>
                    <button
                      className={s.btnLabel}
                      onClick={handleGenerateLabel}
                      disabled={generatingLabel}
                    >
                      {generatingLabel
                        ? <><RefreshCw size={13} className={s.spin} /> Génération…</>
                        : <><Package size={13} /> Générer l'étiquette</>
                      }
                    </button>
                    {order.label_url && (
                      <button className={s.btnSecondary} onClick={handleDownloadLabel}>
                        <Download size={13} /> Télécharger PDF
                      </button>
                    )}
                  </div>
                  {order.tracking_number && (
                    <p className={s.trackingCurrent}>
                      <Truck size={12} /> Suivi actuel : <strong>{order.tracking_number}</strong>
                    </p>
                  )}
                  <p className={s.noteHint}>Génère l'étiquette via La Poste CH et sauvegarde le numéro de suivi automatiquement.</p>
                </td>
              </tr>
              <tr>
                <th className={s.summaryLabel}>Suivi manuel</th>
                <td className={s.summaryValue}>
                  <div className={s.trackingRow}>
                    <input
                      type="text"
                      className={s.trackingInput}
                      placeholder="Ex : 99.00.123456.78901234"
                      value={trackingInput}
                      onChange={e => setTrackingInput(e.target.value.trim())}
                      onKeyDown={e => e.key === 'Enter' && handleSaveTracking()}
                    />
                    <button
                      className={s.btnSave}
                      onClick={handleSaveTracking}
                      disabled={savingTracking || !trackingInput.trim()}
                    >
                      {savingTracking ? <RefreshCw size={13} className={s.spin} /> : 'Enregistrer'}
                    </button>
                  </div>
                  <p className={s.noteHint}>À utiliser uniquement si la génération automatique a échoué.</p>
                </td>
              </tr>

              {/* Facture */}
              <tr className={s.summarySectionRow}>
                <th colSpan={2} className={s.summarySectionLabel}>Facture</th>
              </tr>
              <tr>
                <th className={s.summaryLabel}>Facture PDF</th>
                <td className={s.summaryValue}>
                  <button className={s.btnSecondary} onClick={handleDownloadInvoice}>
                    <FileText size={13} /> Télécharger la facture PDF
                  </button>
                </td>
              </tr>

              {/* Changement de statut manuel — cas avancé */}
              <tr className={s.summarySectionRow}>
                <th colSpan={2} className={s.summarySectionLabel}>Changer le statut manuellement</th>
              </tr>
              <tr>
                <th className={s.summaryLabel}>Nouveau statut</th>
                <td className={s.summaryValue}>
                  <div className={s.statusRow}>
                    <select
                      className={s.select}
                      value={newStatus}
                      onChange={e => setNewStatus(e.target.value)}
                    >
                      {STATUS_OPTIONS.map(o => (
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
                    À utiliser uniquement pour les cas particuliers non couverts par les actions ci-dessus.
                  </p>
                </td>
              </tr>

              {/* Historique — lecture seule */}
              {(order.history ?? []).length > 0 && (
                <>
                  <tr className={s.summarySectionRow}>
                    <th colSpan={2} className={s.summarySectionLabel}>Historique</th>
                  </tr>
                  <tr>
                    <th className={s.summaryLabel}>Statuts précédents</th>
                    <td className={s.summaryValue}>
                      <div className={s.history}>
                        {order.history.map((h, i) => (
                          <div key={i} className={s.historyRow}>
                            <StatusBadge status={h.status} />
                            <span className={s.historyNote}>{h.note}</span>
                            <span className={s.historyDate}>{formatDate(h.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </section>
      </div>

      <div className={s.actionBar}>
        <div className={s.actionBarInner}>
          <div className={s.actionBarLeft}>
            <button className={s.backBtn} onClick={goBack} aria-label="Retour à la liste">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className={s.headerTitle}>Commande #{order.id}</h1>
              <p className={s.headerSub}>{formatDateLong(order.created_at)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
