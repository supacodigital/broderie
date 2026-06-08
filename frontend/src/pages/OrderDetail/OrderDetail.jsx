import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Clock, FileText, Loader2, Download,
  Truck, MapPin, ChevronRight,
} from 'lucide-react'
import { getOrderById, downloadInvoice } from '../../services/orders.service.js'
import { roundCHF } from '../../utils/chf.js'
import { formatDate, formatDateTime } from '../../utils/date.js'
import { STATUS_CFG } from '../../utils/orderStatus.js'
import s from './OrderDetail.module.css'

const PAYMENT_LABELS = {
  card:       'Carte bancaire',
  twint:      'Twint',
  invoice_qr: 'Facture QR',
  pickup:     'Retrait en boutique',
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6', icon: Clock }
  const Icon = cfg.icon
  return (
    <span className={s.statusBadge} style={{ color: cfg.color, background: cfg.bg }}>
      <Icon size={12} />
      {cfg.label}
    </span>
  )
}

/* ── Timeline statuts ── */
const TIMELINE_STEPS = ['pending', 'paid', 'processing', 'shipped', 'delivered']

function StatusTimeline({ currentStatus }) {
  if (['cancelled', 'refunded'].includes(currentStatus)) return null
  const currentIdx = TIMELINE_STEPS.indexOf(currentStatus)

  return (
    <div className={s.timeline}>
      {TIMELINE_STEPS.map((step, i) => {
        const cfg = STATUS_CFG[step]
        const Icon = cfg.icon
        const done = i < currentIdx
        const active = i === currentIdx
        return (
          <div key={step} className={s.timelineStep}>
            <div className={`${s.timelineDot} ${done ? s.done : ''} ${active ? s.active : ''}`}>
              <Icon size={14} />
            </div>
            <span className={`${s.timelineLabel} ${active ? s.activeLabel : ''}`}>{cfg.label}</span>
            {i < TIMELINE_STEPS.length - 1 && (
              <div className={`${s.timelineLine} ${done || active ? s.doneLine : ''}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Bloc Facture QR (téléchargement du PDF) ── */
function InvoiceBlock({ order }) {
  const ref = order.qr_reference ?? String(order.id).padStart(6, '0')
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(null)

  const handleDownload = async () => {
    setError(null)
    setDownloading(true)
    try {
      await downloadInvoice(order.id)
    } catch {
      setError('Impossible de télécharger la facture. Veuillez réessayer.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className={s.invoiceBlock}>
      <h3 className={s.payBlockTitle}>
        <FileText size={16} />
        Facture QR à régler
      </h3>
      <p className={s.payBlockDesc}>
        Réglez votre facture QR suisse depuis votre application bancaire, sous 30 jours.
      </p>
      <div className={s.invoiceDetails}>
        <div className={s.invoiceRow}>
          <span className={s.invoiceLabel}>Référence</span>
          <span className={s.invoiceValue}>{ref}</span>
        </div>
        <div className={s.invoiceRow}>
          <span className={s.invoiceLabel}>Montant</span>
          <span className={s.invoiceValueBold}>CHF {roundCHF(order.total).toFixed(2)}</span>
        </div>
        <div className={s.invoiceRow}>
          <span className={s.invoiceLabel}>Délai de paiement</span>
          <span className={s.invoiceValue}>30 jours</span>
        </div>
      </div>

      <button className={s.invoiceDownloadBtn} onClick={handleDownload} disabled={downloading}>
        {downloading ? <Loader2 size={15} className={s.spin} /> : <Download size={15} />}
        {downloading ? 'Préparation…' : 'Télécharger ma facture (PDF)'}
      </button>
      {error && <p className={s.payError}>{error}</p>}

      <p className={s.invoiceNote}>
        Une facture PDF a aussi été envoyée à votre adresse email. Si vous ne l'avez pas reçue,
        vérifiez vos courriers indésirables.
      </p>
    </div>
  )
}

/* ── Bloc Click & Collect (retrait + paiement en boutique) ── */
function PickupBlock({ status, total }) {
  const isReady = status === 'ready_for_pickup'
  return (
    <div className={s.invoiceBlock} data-ready={isReady ? 'true' : 'false'}>
      <h3 className={s.payBlockTitle}>
        <MapPin size={16} />
        {isReady ? 'Commande prête pour le retrait' : 'Retrait en boutique'}
      </h3>
      {isReady ? (
        <>
          <p className={s.payBlockDesc}>
            Votre commande est prête ! Vous pouvez venir la retirer en boutique.
            L'adresse et les horaires d'ouverture figurent dans l'email que nous venons de vous envoyer.
          </p>
          <div className={s.invoiceDetails}>
            <div className={s.invoiceRow}>
              <span className={s.invoiceLabel}>À régler en boutique</span>
              <span className={s.invoiceValueBold}>CHF {roundCHF(total).toFixed(2)}</span>
            </div>
          </div>
        </>
      ) : (
        <p className={s.payBlockDesc}>
          Votre commande sera préparée. Vous la réglerez directement en boutique au moment du retrait.
          Vous serez prévenu(e) par email dès qu'elle est prête.
        </p>
      )}
    </div>
  )
}

/* ── Skeleton ── */
function Skeleton() {
  return (
    <div className={s.skeleton}>
      <div className={`${s.skLine} ${s.skTitle}`} />
      <div className={`${s.skLine} ${s.skMid}`} />
      <div className={`${s.skLine} ${s.skShort}`} />
      <div className={`${s.skLine} ${s.skFull}`} />
      <div className={`${s.skLine} ${s.skFull}`} />
      <div className={`${s.skLine} ${s.skFull}`} />
    </div>
  )
}

/* ── Page principale ── */
export default function OrderDetail() {
  const { id }    = useParams()
  const [order,   setOrder]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [reload,  setReload]  = useState(0)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setLoading(true)
    getOrderById(id)
      .then(res => { if (!cancelled) { setOrder(res.data); setLoading(false) } })
      .catch(err => {
        if (cancelled) return
        setLoading(false)
        if (err.response?.status === 404) setError('Commande introuvable.')
        else setError('Une erreur est survenue. Veuillez réessayer.')
      })
    return () => { cancelled = true }
  }, [id, reload])

  /* ── Méthode de paiement et blocs contextuels ── */
  const paymentMethod = order?.payment_method ?? null
  const showInvoice = order && order.status === 'pending_invoice' && paymentMethod === 'invoice_qr'
  const showPickup  = order && ['pending_pickup', 'ready_for_pickup'].includes(order.status) && paymentMethod === 'pickup'

  return (
    <div className={s.page}>
      <div className={s.container}>
        {/* Fil d'ariane */}
        <nav className={s.breadcrumb}>
          <Link to="/mon-compte" className={s.breadLink}>
            <ArrowLeft size={15} />
            Mon compte
          </Link>
          <ChevronRight size={13} className={s.breadSep} />
          <span className={s.breadCurrent}>Commande #{id}</span>
        </nav>

        {loading && <Skeleton />}

        {error && !loading && (
          <div className={s.errorState}>
            <p>{error}</p>
            {error !== 'Commande introuvable.' && (
              <button className={s.retryBtn} onClick={() => setReload(r => r + 1)}>Réessayer</button>
            )}
            <Link to="/mon-compte" className={s.backLink}>Retour à mon compte</Link>
          </div>
        )}

        {order && !loading && (
          <>
            {/* En-tête commande */}
            <div className={s.orderHead}>
              <div className={s.orderHeadLeft}>
                <h1 className={s.orderRef}>Commande #{String(order.id).padStart(6, '0')}</h1>
                <p className={s.orderDate}>Passée le {formatDate(order.created_at)}</p>
              </div>
              <StatusBadge status={order.status} />
            </div>

            {/* Barre de progression */}
            <StatusTimeline currentStatus={order.status} />

            {/* Annulée / Remboursée — message spécial */}
            {['cancelled', 'refunded'].includes(order.status) && (
              <div className={s.alertBanner} data-type={order.status}>
                {order.status === 'cancelled'
                  ? 'Cette commande a été annulée.'
                  : 'Cette commande a été remboursée.'}
              </div>
            )}

            <div className={s.grid}>
              {/* Colonne principale */}
              <div className={s.main}>
                {/* Articles */}
                <section className={s.card}>
                  <h2 className={s.cardTitle}>Articles commandés</h2>
                  <div className={s.itemsList}>
                    <div className={s.itemsHead}>
                      <span>Article</span>
                      <span className={s.colQty}>Qté</span>
                      <span className={s.colPrice}>Prix TTC</span>
                    </div>
                    {order.items.map((item) => {
                      const snap = item.product_snapshot_json ?? {}
                      const name = snap.name ?? `Produit #${item.product_id}`
                      const sku  = snap.sku  ?? ''
                      const unitPrice = roundCHF(item.unit_price)
                      const lineTotal = roundCHF(item.unit_price * item.quantity)
                      return (
                        <div key={item.id} className={s.itemRow}>
                          <div className={s.itemInfo}>
                            <span className={s.itemName}>{name}</span>
                            {sku && <span className={s.itemSku}>{sku}</span>}
                            {snap.variant && (
                              <span className={s.itemVariant}>{snap.variant}</span>
                            )}
                          </div>
                          <span className={s.itemQty}>{item.quantity}</span>
                          <div className={s.itemPrices}>
                            <span className={s.itemTotal}>CHF {lineTotal.toFixed(2)}</span>
                            {item.quantity > 1 && (
                              <span className={s.itemUnit}>CHF {unitPrice.toFixed(2)} / u.</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Récapitulatif financier */}
                  <div className={s.totals}>
                    <div className={s.totalRow}>
                      <span>Sous-total TTC</span>
                      <span>CHF {roundCHF(order.subtotal).toFixed(2)}</span>
                    </div>
                    <div className={s.totalRow}>
                      <span>Frais de port</span>
                      <span>CHF {roundCHF(order.shipping_cost).toFixed(2)}</span>
                    </div>
                    <div className={s.totalRow}>
                      <span>TVA incluse</span>
                      <span>CHF {roundCHF(order.tax_amount).toFixed(2)}</span>
                    </div>
                    <div className={`${s.totalRow} ${s.totalFinal}`}>
                      <span>Total TTC</span>
                      <span>CHF {roundCHF(order.total).toFixed(2)}</span>
                    </div>
                  </div>
                </section>

                {/* Suivi de colis — visible si tracking_number disponible */}
                {order.tracking_number && ['shipped', 'delivered'].includes(order.status) && (
                  <section className={s.card}>
                    <h2 className={s.cardTitle}>Suivi de votre colis</h2>
                    <div className={s.trackingBlock}>
                      <Truck size={16} className={s.trackingIcon} />
                      <div className={s.trackingInfo}>
                        <span className={s.trackingLabel}>Numéro de suivi</span>
                        <strong className={s.trackingNumber}>{order.tracking_number}</strong>
                      </div>
                      <a
                        href={`https://www.post.ch/fr/outils/suivi-de-colis?track=${order.tracking_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={s.trackingLink}
                      >
                        Suivre sur post.ch →
                      </a>
                    </div>
                  </section>
                )}

                {/* Facture QR à régler */}
                {showInvoice && (
                  <InvoiceBlock order={order} />
                )}

                {/* Retrait en boutique (Click & Collect) */}
                {showPickup && (
                  <PickupBlock status={order.status} total={order.total} />
                )}

                {/* Historique des statuts */}
                {order.history?.length > 0 && (
                  <section className={s.card}>
                    <h2 className={s.cardTitle}>Historique de la commande</h2>
                    <div className={s.historyList}>
                      {order.history.map((h, i) => {
                        const cfg = STATUS_CFG[h.status] ?? { label: h.status, color: '#6b7280', bg: '#f3f4f6', icon: Clock }
                        const Icon = cfg.icon
                        return (
                          <div key={i} className={s.historyItem}>
                            <div className={s.historyDot} style={{ background: cfg.bg, color: cfg.color }}>
                              <Icon size={13} />
                            </div>
                            <div className={s.historyContent}>
                              <span className={s.historyStatus} style={{ color: cfg.color }}>
                                {cfg.label}
                              </span>
                              {h.note && <p className={s.historyNote}>{h.note}</p>}
                              <span className={s.historyDate}>{formatDateTime(h.created_at)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}
              </div>

              {/* Colonne latérale */}
              <aside className={s.aside}>
                {/* Infos commande */}
                <section className={s.card}>
                  <h2 className={s.cardTitle}>Informations</h2>
                  <div className={s.infoList}>
                    <div className={s.infoItem}>
                      <span className={s.infoLabel}>Référence</span>
                      <span className={s.infoValue}>#{String(order.id).padStart(6, '0')}</span>
                    </div>
                    <div className={s.infoItem}>
                      <span className={s.infoLabel}>Date</span>
                      <span className={s.infoValue}>{formatDate(order.created_at)}</span>
                    </div>
                    <div className={s.infoItem}>
                      <span className={s.infoLabel}>Statut</span>
                      <StatusBadge status={order.status} />
                    </div>
                    {paymentMethod && (
                      <div className={s.infoItem}>
                        <span className={s.infoLabel}>Paiement</span>
                        <span className={s.infoValue}>
                          {PAYMENT_LABELS[paymentMethod] ?? paymentMethod}
                        </span>
                      </div>
                    )}
                    <div className={s.infoItem}>
                      <span className={s.infoLabel}>Articles</span>
                      <span className={s.infoValue}>{order.items.length}</span>
                    </div>
                  </div>
                </section>

                {/* Livraison */}
                <section className={s.card}>
                  <h2 className={s.cardTitle}>
                    <Truck size={15} />
                    Livraison
                  </h2>
                  <div className={s.deliveryInfo}>
                    <MapPin size={14} className={s.deliveryIcon} />
                    <div>
                      <p className={s.deliveryCarrier}>Swiss Post — La Poste</p>
                    </div>
                  </div>
                </section>

                {/* Aide */}
                <section className={s.card}>
                  <h2 className={s.cardTitle}>Besoin d'aide ?</h2>
                  <p className={s.helpText}>
                    Pour toute question concernant votre commande, contactez-nous par email.
                  </p>
                  <a href="mailto:contact@broderie.ch" className={s.helpLink}>
                    Contacter le service client
                  </a>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
