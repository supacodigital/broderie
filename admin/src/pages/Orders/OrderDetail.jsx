import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, CalendarDays, Check, ClipboardList, FileText, Package, PackageCheck, Printer, QrCode,
  RefreshCw, Store, Truck, User,
} from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog/ConfirmDialog.jsx'
import Card from '../../components/ui/Card/Card.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import {
  getOrderById, updateOrderStatus, downloadInvoice, generateLabel, downloadLabel, updateTracking, sendTwintQr,
} from '../../services/orders.service.js'
import { STATUS_CFG } from '../../utils/orderStatus.js'
import { formatDateTime } from '../../utils/date.js'
import { buildSteps, currentStage, isPickupOrder } from '../../utils/orderFlow.js'
import PaymentDetails from './PaymentDetails.jsx'
import OrderStepper from './OrderStepper.jsx'
import OrderItems from './OrderItems.jsx'
import OrderCustomer from './OrderCustomer.jsx'
import OrderShipping from './OrderShipping.jsx'
import OrderHistory from './OrderHistory.jsx'
import OrderStatusEditor, { STATUS_OPTIONS } from './OrderStatusEditor.jsx'
import s from './OrderDetail.module.css'

/* Modes d'envoi (ADM-10) : étiquette PostPac Economy ou Priority, ou envoi déjà
   affranchi sur WebStamp. Economy par défaut : le moins cher, livré en 2 jours. */
const SHIPPING_METHODS = {
  ECO:  'PostPac Economy (2 jours ouvrables)',
  PRI:  'PostPac Priority (jour ouvrable suivant)',
  NONE: 'Déjà affranchi (WebStamp) — pas d’étiquette',
}

/* QR Twint utile tant que la commande n'est pas payée. Mêmes statuts que le
   serveur : « retrait + paiement en boutique » en est exclu (envoi refusé). */
const TWINT_QR_STATUSES = ['pending', 'awaiting_payment', 'payment_failed', 'pending_invoice']

function StatusBadge({ status }) {
  const c = STATUS_CFG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6', dot: '#9ca3af' }
  return (
    <span className={s.statusBadge} style={{ color: c.color, background: c.bg }}>
      <span className={s.statusDot} style={{ background: c.dot ?? c.color }} />
      {c.label}
    </span>
  )
}

function PageSkeleton() {
  return (
    <div className={s.page} aria-busy="true" aria-label="Chargement de la commande">
      <span className={`${s.skeleton} ${s.skeletonHead}`} />
      <div className={s.layout}>
        <div className={s.main}>
          <span className={`${s.skeleton} ${s.skeletonCard}`} />
          <span className={`${s.skeleton} ${s.skeletonCardTall}`} />
        </div>
        <div className={s.side}>
          <span className={`${s.skeleton} ${s.skeletonCard}`} />
        </div>
      </div>
    </div>
  )
}

// ── Page détail commande ────────────────────────────────────────────────────
export default function OrderDetail() {
  const navigate = useNavigate()
  const toast    = useToast()
  const { id }   = useParams()
  const orderId  = Number(id)

  const [order,          setOrder]          = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [confirm,        setConfirm]        = useState(null)
  // Action en cours (clé) : un seul bouton tourne à la fois
  const [busy,           setBusy]           = useState(null)
  const [shippingMethod, setShippingMethod] = useState('ECO')
  const [stepNote,       setStepNote]       = useState('')

  /* `silent` : rechargement après une action, sans repasser par le squelette */
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      setOrder(await getOrderById(orderId))
    } catch {
      if (!silent) setOrder(null)
    } finally {
      if (!silent) setLoading(false)
    }
    window.dispatchEvent(new Event('admin:data-changed'))
  }, [orderId])

  useEffect(() => { load() }, [load])

  /* Retour en remontant l'historique : les filtres de la liste vivent dans son
     URL, et un navigate('/commandes') sec les effaçait — on revenait sur la liste
     complète après chaque commande traitée. Repli sur l'URL nue quand il n'y a
     pas d'historique (lien direct, nouvel onglet). */
  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/commandes')
  }

  /* « Expédiée » : l'étiquette n'est générée que s'il n'y a pas encore de suivi
     et qu'un envoi PostPac est choisi — un envoi affranchi sur WebStamp n'en
     déclenche plus une seconde, facturée (ADM-10). */
  const shippedSideEffect = () => {
    if (order?.tracking_number) {
      return `Un email d’expédition avec le suivi ${order.tracking_number} sera envoyé au client.`
    }
    if (shippingMethod === 'NONE') {
      return 'Un email d’expédition sera envoyé au client, sans numéro de suivi (saisissez-le d’abord dans « Expédition » s’il en existe un).'
    }
    return `Un email d’expédition sera envoyé au client, et une étiquette ${SHIPPING_METHODS[shippingMethod].split(' (')[0]} sera générée (prestation facturée par La Poste).`
  }

  /* Statuts qui écrivent à la cliente (et, pour « Expédiée », génèrent une vraie
     étiquette facturée) : ils demandent confirmation. Les statuts internes
     restent immédiats, pour ne pas transformer chaque clic en dialogue. */
  const STATUS_SIDE_EFFECTS = {
    shipped:          shippedSideEffect,
    ready_for_pickup: () => 'Un email « votre commande est prête » sera envoyé au client.',
  }

  const runStatusChange = async (target, note, successMessage) => {
    setBusy(`status:${target}`)
    try {
      await updateOrderStatus(orderId, target, note || undefined,
        target === 'shipped' ? { shippingMethod } : {})
      setStepNote('')
      toast.success(successMessage ?? 'Statut mis à jour.')
      await load({ silent: true })
      return true
    } catch {
      toast.error('Erreur lors de la mise à jour du statut.')
      return false
    } finally {
      setBusy(null)
    }
  }

  /* Retourne true si le changement a été fait tout de suite, false s'il attend
     une confirmation (ou a échoué). */
  const requestStatusChange = async (target, { note, successMessage } = {}) => {
    if (!order || target === order.status) return false
    const sideEffect = STATUS_SIDE_EFFECTS[target]?.()
    if (sideEffect) {
      const label = STATUS_OPTIONS.find(o => o.value === target)?.label ?? target
      setConfirm({
        message: `Passer la commande #${order.id} en « ${label} » ? ${sideEffect}`,
        onConfirm: () => runStatusChange(target, note, successMessage),
      })
      return false
    }
    return runStatusChange(target, note, successMessage)
  }

  const handleMarkAsPaid = () => runStatusChange(
    'paid', stepNote || 'Paiement confirmé manuellement', 'Commande marquée comme payée.'
  )

  const handleMarkReady = () => requestStatusChange('ready_for_pickup', {
    note: stepNote, successMessage: 'Commande marquée comme prête. La cliente a été prévenue par email.',
  })

  const handleSendTwintQr = async () => {
    setBusy('twint')
    try {
      await sendTwintQr(orderId)
      toast.success('QR Twint envoyé par email à la cliente.')
      await load({ silent: true })
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Impossible d\'envoyer le QR Twint.')
    } finally {
      setBusy(null)
    }
  }

  const handleDownloadInvoice = async () => {
    setBusy('invoice')
    try {
      await downloadInvoice(orderId)
    } catch {
      toast.error('Impossible de télécharger la facture.')
    } finally {
      setBusy(null)
    }
  }

  const handleGenerateLabel = async () => {
    setBusy('label')
    try {
      const label = await generateLabel(orderId, shippingMethod)
      toast.success(`Étiquette générée — suivi : ${label.trackingNumber}`)
      await load({ silent: true })
    } catch (err) {
      toast.error(err.response?.data?.message ?? 'Impossible de générer l\'étiquette. Vérifiez la connexion au serveur.')
    } finally {
      setBusy(null)
    }
  }

  const handleSaveTracking = async (tracking) => {
    try {
      await updateTracking(orderId, tracking)
      toast.success('Numéro de suivi enregistré.')
      await load({ silent: true })
      return true
    } catch {
      toast.error('Impossible d\'enregistrer le numéro de suivi.')
      return false
    }
  }

  if (loading) return <PageSkeleton />

  if (!order) {
    return (
      <div className={s.page}>
        <div className={s.stateBox}>
          <p className={s.stateTitle}>Commande introuvable</p>
          <Link to="/commandes" className={s.stateLink}>Retour aux commandes</Link>
        </div>
      </div>
    )
  }

  const pickup = isPickupOrder(order)
  const stage  = currentStage(order)
  const steps  = buildSteps(order)
  const canSendTwintQr = TWINT_QR_STATUSES.includes(order.status)
  const notShippedYet  = !['shipped', 'delivered', 'cancelled', 'refunded'].includes(order.status)
  const statusBusy = (target) => busy === `status:${target}`
  const anyBusy = busy !== null

  const spinner = <RefreshCw size={13} className={s.spin} aria-hidden="true" />

  /* ── Actions de l'étape en cours ── */
  const noteField = (
    <div className={s.noteField}>
      <label className={s.fieldLabel} htmlFor="step-note">
        Note pour l'historique <span className={s.optional}>facultatif</span>
      </label>
      <input
        id="step-note"
        type="text"
        className={s.input}
        value={stepNote}
        onChange={e => setStepNote(e.target.value)}
        placeholder="ex. Virement reçu le 30.09"
      />
    </div>
  )

  const twintButton = (primary) => canSendTwintQr && (
    <button type="button" className={primary ? s.btnPrimary : s.btnSecondary} onClick={handleSendTwintQr} disabled={anyBusy}>
      {busy === 'twint' ? spinner : <QrCode size={14} aria-hidden="true" />} Envoyer un QR Twint par e-mail
    </button>
  )

  const markPaidButton = (primary, label = 'Marquer comme payée') => (
    <button type="button" className={primary ? s.btnPrimary : s.btnSecondary} onClick={handleMarkAsPaid} disabled={anyBusy}>
      {statusBusy('paid') ? spinner : <Check size={14} aria-hidden="true" />} {label}
    </button>
  )

  let stageActions = null
  switch (stage.kind) {
    case 'online_unpaid':
      stageActions = canSendTwintQr && (
        <>
          <div className={s.actions}>{twintButton(true)}</div>
          <p className={s.actionHint}>Génère un QR code de paiement Twint (valable 24 h) et l'envoie à la cliente.</p>
        </>
      )
      break
    case 'invoice_unpaid':
      stageActions = (
        <>
          <div className={s.actions}>
            {markPaidButton(true)}
            {twintButton(false)}
          </div>
          {noteField}
        </>
      )
      break
    case 'pickup_prepare':
      stageActions = (
        <>
          <div className={s.actions}>
            <button type="button" className={s.btnPrimary} onClick={handleMarkReady} disabled={anyBusy}>
              {statusBusy('ready_for_pickup') ? spinner : <Store size={14} aria-hidden="true" />} Marquer prête pour le retrait
            </button>
            {markPaidButton(false)}
          </div>
          <p className={s.actionHint}>« Prête pour le retrait » envoie un e-mail à la cliente (adresse et horaires).</p>
          {noteField}
        </>
      )
      break
    case 'pickup_ready':
      stageActions = (
        <>
          <div className={s.actions}>{markPaidButton(true, 'Marquer comme payée (encaissée au comptoir)')}</div>
          {noteField}
        </>
      )
      break
    case 'to_ship':
      stageActions = (
        <>
          <div className={s.shipRow}>
            <div className={s.shipField}>
              <label className={s.fieldLabel} htmlFor="shipping-method">Mode d’envoi</label>
              <select
                id="shipping-method"
                className={s.select}
                value={shippingMethod}
                onChange={e => setShippingMethod(e.target.value)}
              >
                {Object.entries(SHIPPING_METHODS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className={s.actions}>
            <button
              type="button"
              className={s.btnPrimary}
              onClick={() => requestStatusChange('shipped', { note: stepNote, successMessage: 'Commande marquée comme expédiée.' })}
              disabled={anyBusy}
            >
              {statusBusy('shipped') ? spinner : <Truck size={14} aria-hidden="true" />} Marquer comme expédiée
            </button>
            {!order.tracking_number && (
              <button
                type="button"
                className={s.btnSecondary}
                onClick={handleGenerateLabel}
                disabled={anyBusy || shippingMethod === 'NONE'}
                title={shippingMethod === 'NONE' ? 'Envoi affranchi sur WebStamp : saisissez son numéro dans « Expédition »' : undefined}
              >
                {busy === 'label' ? spinner : <Package size={14} aria-hidden="true" />} Générer seulement l'étiquette
              </button>
            )}
            {order.status === 'paid' && (
              <button
                type="button"
                className={s.btnSecondary}
                onClick={() => requestStatusChange('processing', { note: stepNote, successMessage: 'Commande passée en préparation.' })}
                disabled={anyBusy}
              >
                {statusBusy('processing') ? spinner : <ClipboardList size={14} aria-hidden="true" />} Passer en préparation
              </button>
            )}
          </div>
          <p className={s.actionHint}>
            {order.tracking_number
              ? `Étiquette déjà générée (suivi ${order.tracking_number}) : aucune nouvelle étiquette ne sera créée.`
              : '« Marquer comme expédiée » envoie l’e-mail d’expédition et génère l’étiquette La Poste si besoin — une confirmation est demandée.'}
          </p>
          {noteField}
        </>
      )
      break
    case 'shipped':
      stageActions = (
        <>
          <div className={s.actions}>
            <button
              type="button"
              className={s.btnSecondary}
              onClick={() => requestStatusChange('delivered', { note: stepNote, successMessage: 'Commande marquée comme livrée.' })}
              disabled={anyBusy}
            >
              {statusBusy('delivered') ? spinner : <PackageCheck size={14} aria-hidden="true" />} Marquer comme livrée
            </button>
          </div>
          {noteField}
        </>
      )
      break
    default:
      stageActions = null
  }

  return (
    <div className={s.page}>
      {confirm && <ConfirmDialog {...confirm} danger={false} onClose={() => setConfirm(null)} />}

      {/* ── En-tête : de quelle commande s'agit-il ── */}
      <header className={s.head}>
        <button type="button" className={s.backBtn} onClick={goBack} aria-label="Retour à la liste des commandes">
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div className={s.headMain}>
          <div className={s.titleRow}>
            <h1 className={s.title}>Commande #{order.id}</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className={s.meta}>
            <span><CalendarDays size={13} aria-hidden="true" /> {formatDateTime(order.created_at)}</span>
            {/* Le n° de facture est la référence que la cliente cite au
                téléphone : il doit être lisible sans ouvrir le PDF. */}
            {order.invoice_number && (
              <span><FileText size={13} aria-hidden="true" /> Facture <strong>{order.invoice_number}</strong></span>
            )}
            <span><User size={13} aria-hidden="true" /> {order.first_name} {order.last_name}</span>
          </p>
        </div>
        <button type="button" className={s.btnSecondary} onClick={handleDownloadInvoice} disabled={busy === 'invoice'}>
          {busy === 'invoice' ? spinner : <FileText size={14} aria-hidden="true" />} Facture PDF
        </button>
      </header>

      <div className={s.layout}>
        {/* ── Colonne principale : où en est la commande, quoi, combien ── */}
        <div className={s.main}>
          <Card
            title="Traitement"
            icon={ClipboardList}
            className={s.orderProgress}
            aside={<span className={s.modeChip}>{pickup ? 'Retrait en boutique' : 'Envoi par La Poste'}</span>}
          >
            {stage.kind !== 'closed' && (
              <div className={s.stepperWrap}><OrderStepper steps={steps} /></div>
            )}
            <div className={s.stage} data-tone={stage.tone}>
              <p className={s.stageTitle}>{stage.title}</p>
              {stage.description && <p className={s.stageText}>{stage.description}</p>}
            </div>

            {/* Facture papier demandée : à joindre au colis, donc visible tant qu'il n'est pas parti */}
            {!!order.wants_printed_invoice && notShippedYet && (
              <div className={s.printedNotice}>
                <Printer size={16} aria-hidden="true" />
                <div>
                  <strong>Facture imprimée demandée</strong>
                  <span>La cliente souhaite une facture papier jointe au colis.</span>
                </div>
                <button type="button" className={s.btnLink} onClick={handleDownloadInvoice}>Imprimer la facture</button>
              </div>
            )}

            {stageActions && <div className={s.stageActions}>{stageActions}</div>}
          </Card>

          <div className={s.orderItems}><OrderItems order={order} /></div>

          <div className={s.orderPayment}>
            {/* Transaction : moyen, encaissement, frais, références Stripe, tentatives */}
            <PaymentDetails orderId={order.id} reloadKey={order.status} />
          </div>

          <div className={s.orderHistory}><OrderHistory history={order.history} /></div>
        </div>

        {/* ── Colonne latérale : qui, où, et les réglages ── */}
        <div className={s.side}>
          <div className={s.orderCustomer}><OrderCustomer order={order} pickup={pickup} /></div>

          {!pickup && (
            <div className={s.orderShipping}>
              <OrderShipping
                order={order}
                onSaveTracking={handleSaveTracking}
                onDownloadLabel={() => downloadLabel(orderId)}
              />
            </div>
          )}

          <div className={s.orderStatus}>
            <OrderStatusEditor
              key={order.status}
              status={order.status}
              saving={busy?.startsWith('status:')}
              onSubmit={(target, note) => requestStatusChange(target, { note })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
