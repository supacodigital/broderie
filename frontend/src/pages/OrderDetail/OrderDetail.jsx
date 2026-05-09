import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Package, Truck, CheckCircle, XCircle, Clock,
  RotateCcw, CreditCard, FileText, RefreshCw, Loader2,
  MapPin, ChevronRight,
} from 'lucide-react'
import { getOrderById } from '../../services/orders.service.js'
import { createTwintIntent } from '../../services/payments.service.js'
import s from './OrderDetail.module.css'

/* ── Config statuts ── */
const STATUS_CFG = {
  pending:          { label: 'En attente',      color: '#d97706', bg: '#fffbeb',  icon: Clock       },
  awaiting_payment: { label: 'Paiement attendu', color: '#ea580c', bg: '#fff7ed', icon: CreditCard  },
  paid:             { label: 'Payée',            color: '#059669', bg: '#ecfdf5', icon: CheckCircle },
  processing:       { label: 'En préparation',   color: '#0891b2', bg: '#ecfeff', icon: Package     },
  shipped:          { label: 'Expédiée',         color: '#2563eb', bg: '#eff6ff', icon: Truck       },
  delivered:        { label: 'Livrée',           color: '#7c3aed', bg: '#f5f3ff', icon: CheckCircle },
  cancelled:        { label: 'Annulée',          color: '#dc2626', bg: '#fef2f2', icon: XCircle     },
  refunded:         { label: 'Remboursée',       color: '#9d174d', bg: '#fdf2f8', icon: RotateCcw   },
}

const PAYMENT_LABELS = {
  invoice: 'Facture',
  twint:   'Twint QR',
  card:    'Carte bancaire',
}

/* ── Utilitaires ── */
const roundCHF = (n) => Math.round(n * 20) / 20

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-CH', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('fr-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
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

/* ── Bloc Twint QR (si paiement attendu via Twint) ── */
function TwintBlock({ orderId, onPaid }) {
  const [qrUrl, setQrUrl]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [expiry, setExpiry]   = useState(null)
  const pollRef = useRef(null)

  const fetchQr = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await createTwintIntent(orderId)
      setQrUrl(res.qrUrl)
      setExpiry(res.expiresAt)
    } catch {
      setError('Impossible de générer le QR Twint. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  /* Polling pour détecter le paiement */
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await getOrderById(orderId)
        if (res.data?.status === 'paid') {
          clearInterval(pollRef.current)
          onPaid()
        }
      } catch { /* silencieux */ }
    }, 5000)
    return () => clearInterval(pollRef.current)
  }, [orderId, onPaid])

  useEffect(() => { fetchQr() }, [fetchQr])

  return (
    <div className={s.twintBlock}>
      <h3 className={s.payBlockTitle}>Payer par Twint</h3>
      <p className={s.payBlockDesc}>
        Scannez le QR code avec votre application Twint pour finaliser votre paiement.
      </p>
      {loading && (
        <div className={s.twintLoading}>
          <Loader2 size={28} className={s.spin} />
          <span>Génération du QR en cours…</span>
        </div>
      )}
      {error && (
        <div className={s.payError}>
          <p>{error}</p>
          <button className={s.retryBtn} onClick={fetchQr}>Réessayer</button>
        </div>
      )}
      {qrUrl && !loading && (
        <>
          <div className={s.twintQrWrap}>
            <img src={qrUrl} alt="QR Twint" className={s.twintQrImg} width={200} height={200} />
          </div>
          {expiry && (
            <p className={s.twintExpiry}>
              QR valide jusqu'au {formatDateTime(expiry)}
            </p>
          )}
          <p className={s.twintPolling}>
            <Loader2 size={13} className={s.spin} />
            Vérification du paiement en cours…
          </p>
          <button className={s.retryBtn} onClick={fetchQr}>
            <RefreshCw size={14} />
            Générer un nouveau QR
          </button>
        </>
      )}
    </div>
  )
}

/* ── Bloc Facture (si paiement attendu par facture) ── */
function InvoiceBlock({ order }) {
  const ref = String(order.id).padStart(6, '0')
  return (
    <div className={s.invoiceBlock}>
      <h3 className={s.payBlockTitle}>
        <FileText size={16} />
        Paiement par facture
      </h3>
      <p className={s.payBlockDesc}>
        Vous avez choisi le paiement par facture. Vous recevrez votre facture par email
        avec toutes les informations de virement.
      </p>
      <div className={s.invoiceDetails}>
        <div className={s.invoiceRow}>
          <span className={s.invoiceLabel}>Référence</span>
          <span className={s.invoiceValue}>FAC-{ref}</span>
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
      <p className={s.invoiceNote}>
        Une facture PDF a été envoyée à votre adresse email. Si vous ne l'avez pas reçue,
        vérifiez vos courriers indésirables.
      </p>
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
  const navigate  = useNavigate()
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

  const handlePaid = useCallback(() => setReload(r => r + 1), [])

  /* ── Déterminer la méthode de paiement depuis le dernier historique ── */
  const paymentMethod = order?.payment_method ?? null
  const showTwint  = order && order.status === 'awaiting_payment' && paymentMethod === 'twint'
  const showInvoice = order && order.status === 'awaiting_payment' && paymentMethod === 'invoice'

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
              <button className={s.retryBtn} onClick={loadOrder}>Réessayer</button>
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
                      <span>Sous-total HT</span>
                      <span>CHF {roundCHF(order.subtotal).toFixed(2)}</span>
                    </div>
                    <div className={s.totalRow}>
                      <span>Frais de port</span>
                      <span>CHF {roundCHF(order.shipping_cost).toFixed(2)}</span>
                    </div>
                    <div className={s.totalRow}>
                      <span>TVA (8.1%)</span>
                      <span>CHF {roundCHF(order.tax_amount).toFixed(2)}</span>
                    </div>
                    <div className={`${s.totalRow} ${s.totalFinal}`}>
                      <span>Total TTC</span>
                      <span>CHF {roundCHF(order.total).toFixed(2)}</span>
                    </div>
                  </div>
                </section>

                {/* Paiement Twint en attente */}
                {showTwint && (
                  <TwintBlock orderId={order.id} onPaid={handlePaid} />
                )}

                {/* Facture en attente */}
                {showInvoice && (
                  <InvoiceBlock order={order} />
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
                      <p className={s.deliveryDelay}>Délai estimé : 1-2 jours ouvrables</p>
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
