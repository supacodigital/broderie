import { useEffect, useState } from 'react'
import { AlertTriangle, CreditCard, ExternalLink, FileText, Receipt, RefreshCw, Smartphone, Store } from 'lucide-react'
import { getOrderPayment } from '../../services/orders.service.js'
import { formatCents } from '../../utils/chf.js'
import { formatDate, formatDateTime } from '../../utils/date.js'
import CopyButton from '../../components/ui/CopyButton/CopyButton.jsx'
import Card from '../../components/ui/Card/Card.jsx'
import s from './PaymentDetails.module.css'

const METHODS = {
  card:       { label: 'Carte bancaire', icon: CreditCard },
  twint:      { label: 'Twint',          icon: Smartphone },
  invoice_qr: { label: 'Facture QR',     icon: FileText },
  pickup:     { label: 'Paiement au retrait en boutique', icon: Store },
}

const PAYMENT_STATUS = {
  paid:               { label: 'Payée',                   tone: 'success' },
  pending:            { label: 'En attente de paiement',  tone: 'warning' },
  failed:             { label: 'Paiement refusé',         tone: 'danger' },
  refunded:           { label: 'Remboursée',              tone: 'muted' },
  partially_refunded: { label: 'Remboursée en partie',    tone: 'muted' },
  cancelled:          { label: 'Annulée',                 tone: 'muted' },
}

const ATTEMPT_STATUS = {
  pending:    { label: 'En attente', tone: 'warning' },
  processing: { label: 'En cours',   tone: 'warning' },
  succeeded:  { label: 'Réussi',     tone: 'success' },
  failed:     { label: 'Refusé',     tone: 'danger' },
  cancelled:  { label: 'Annulé',     tone: 'muted' },
  refunded:   { label: 'Remboursé',  tone: 'muted' },
}

const RISK = {
  normal:       'Risque normal',
  elevated:     'Risque élevé',
  highest:      'Risque très élevé',
  not_assessed: 'Non évalué',
  unknown:      'Inconnu',
}

const NETWORK = {
  approved_by_network:     'approuvé par le réseau',
  declined_by_network:     'refusé par le réseau',
  not_sent_to_network:     'non transmis au réseau',
  reversed_after_approval: 'annulé après approbation',
}

const THREE_D_SECURE = {
  authenticated:        'Authentifiée',
  attempt_acknowledged: 'Tentative reconnue',
  exempted:             'Exemptée',
  failed:               'Échouée',
  not_supported:        'Non prise en charge',
  processing_error:     'Erreur de traitement',
}

// Référence QR à 27 chiffres, groupée comme sur le bulletin : « 00 00000 00000 … »
function formatQrReference(ref) {
  if (!ref || !/^\d{27}$/.test(ref)) return ref
  return `${ref.slice(0, 2)} ${ref.slice(2).match(/.{5}/g).join(' ')}`
}

function Chip({ tone, children }) {
  return <span className={s.chip} data-tone={tone}>{children}</span>
}

// `wide` : toute la largeur de la carte (référence QR, trop longue pour une colonne)
function Fact({ label, children, sub, wide = false }) {
  return (
    <div className={`${s.fact} ${wide ? s.factWide : ''}`}>
      <dt className={s.factLabel}>{label}</dt>
      <dd className={s.factValue}>
        {children}
        {sub && <span className={s.factSub}>{sub}</span>}
      </dd>
    </div>
  )
}

/* Moyen de paiement tel que Stripe l'a encaissé : « Visa •••• 4242 » plutôt
   que « Carte bancaire », avec l'expiration, le pays et le portefeuille. */
function methodDescription(data) {
  const card = data.stripe?.card
  if (card?.last4) {
    const extras = [
      card.exp_month && card.exp_year ? `exp. ${String(card.exp_month).padStart(2, '0')}/${String(card.exp_year).slice(-2)}` : null,
      card.country,
      card.wallet,
    ].filter(Boolean).join(' · ')
    return { label: `${card.brand ?? 'Carte'} •••• ${card.last4}`, sub: extras || null, icon: CreditCard }
  }
  const method = METHODS[data.method] ?? { label: data.method ?? '—', icon: CreditCard }
  const sub = data.chosen_method && data.chosen_method !== data.method
    ? `Commande passée avec « ${METHODS[data.chosen_method]?.label ?? data.chosen_method} »`
    : null
  return { ...method, sub }
}

function Skeleton() {
  return (
    <div className={s.skeletonWrap} aria-busy="true" aria-label="Chargement de la transaction">
      {[0, 1, 2, 3].map(i => <span key={i} className={s.skeletonLine} />)}
    </div>
  )
}

/* ── Détail de la transaction de la cliente ──
   `reloadKey` : un changement (statut de la commande) recharge le détail. */
export default function PaymentDetails({ orderId, reloadKey }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [retry,   setRetry]   = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    getOrderPayment(orderId)
      .then(res => { if (!cancelled) setData(res) })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [orderId, reloadKey, retry])

  const status = data ? (PAYMENT_STATUS[data.status] ?? PAYMENT_STATUS.pending) : null
  const stripe = data?.stripe
  const method = data ? methodDescription(data) : null
  const MethodIcon = method?.icon
  const paidAt = stripe?.paid_at ?? data?.paid_at
  const isPaid = ['paid', 'refunded', 'partially_refunded'].includes(data?.status)
  const showAttempts = (data?.attempts ?? []).length > 1 || (data?.attempts ?? []).some(a => a.status !== 'succeeded')

  return (
    <Card
      title="Transaction"
      subtitle="Paiement de la cliente"
      icon={Receipt}
      aside={data && (
        <>
          {stripe && !stripe.livemode && <Chip tone="warning">Paiement de test</Chip>}
          <Chip tone={status.tone}>{status.label}</Chip>
        </>
      )}
    >

      {loading && !data ? (
        <Skeleton />
      ) : error ? (
        <div className={s.errorBox} role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>Impossible de charger le détail du paiement.</span>
          <button type="button" className={s.retryBtn} onClick={() => setRetry(r => r + 1)}>
            <RefreshCw size={12} aria-hidden="true" /> Réessayer
          </button>
        </div>
      ) : data && (
        <>
          {data.stripe_unavailable && (
            <p className={s.notice}>
              <AlertTriangle size={13} aria-hidden="true" />
              Détails Stripe momentanément indisponibles : seules les informations de la boutique sont affichées.
            </p>
          )}

          <dl className={s.facts}>
            <Fact label="Moyen de paiement" sub={method.sub}>
              <span className={s.method}>
                {MethodIcon && <MethodIcon size={14} aria-hidden="true" />}
                {method.label}
              </span>
            </Fact>

            <Fact label={isPaid ? 'Montant encaissé' : 'Montant dû'}>
              <span className={s.amount}>{formatCents(isPaid && stripe?.amount_received != null ? stripe.amount_received : data.total)}</span>
            </Fact>

            {paidAt && <Fact label="Payée le">{formatDateTime(paidAt)}</Fact>}

            {stripe?.fee != null && (
              <Fact label="Frais Stripe" sub={`Net reçu : ${formatCents(stripe.net)}`}>
                {formatCents(stripe.fee)}
              </Fact>
            )}

            {stripe?.available_on && isPaid && (
              <Fact label="Fonds disponibles le" sub="Sur le solde Stripe, avant virement vers le compte">
                {formatDate(stripe.available_on)}
              </Fact>
            )}

            {stripe?.risk_level && (
              <Fact label="Contrôle antifraude">
                {RISK[stripe.risk_level] ?? stripe.risk_level}
                {stripe.network_status && ` · ${NETWORK[stripe.network_status] ?? stripe.network_status}`}
              </Fact>
            )}

            {stripe?.card?.three_d_secure && (
              <Fact label="3-D Secure">{THREE_D_SECURE[stripe.card.three_d_secure] ?? stripe.card.three_d_secure}</Fact>
            )}

            {stripe?.amount_refunded > 0 && (
              <Fact label="Remboursé">
                <span className={s.refund}>{formatCents(stripe.amount_refunded)}</span>
              </Fact>
            )}

            {stripe?.last_error && !isPaid && (
              <Fact label="Motif du refus">
                <span className={s.decline}>{stripe.last_error.reason}</span>
              </Fact>
            )}

            {data.invoice?.number && <Fact label="N° de facture">{data.invoice.number}</Fact>}

            {data.invoice?.qr_reference && (
              <Fact label="Référence QR" wide>
                <span className={s.mono}>{formatQrReference(data.invoice.qr_reference)}</span>
                <CopyButton text={data.invoice.qr_reference} label="Copier la référence QR" />
              </Fact>
            )}
          </dl>

          {stripe && (
            <div className={s.refs}>
              <div className={s.ref}>
                <span className={s.refLabel}>Réf. paiement</span>
                <code className={s.refCode}>{stripe.intent_id}</code>
                <CopyButton text={stripe.intent_id} label="Copier la référence du paiement" />
              </div>
              {stripe.charge_id && (
                <div className={s.ref}>
                  <span className={s.refLabel}>Réf. transaction</span>
                  <code className={s.refCode}>{stripe.charge_id}</code>
                  <CopyButton text={stripe.charge_id} label="Copier la référence de la transaction" />
                </div>
              )}
              <div className={s.links}>
                <a href={stripe.dashboard_url} target="_blank" rel="noopener noreferrer" className={s.link}>
                  Voir dans Stripe <ExternalLink size={12} aria-hidden="true" />
                </a>
                {stripe.receipt_url && (
                  <a href={stripe.receipt_url} target="_blank" rel="noopener noreferrer" className={s.link}>
                    Reçu Stripe <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
              </div>
            </div>
          )}

          {showAttempts && (
            <div className={s.attempts}>
              <h3 className={s.subTitle}>Tentatives de paiement</h3>
              <ul className={s.attemptList}>
                {data.attempts.map(a => {
                  const st = ATTEMPT_STATUS[a.status] ?? { label: a.status, tone: 'muted' }
                  return (
                    <li key={a.id} className={s.attempt}>
                      <span className={s.attemptDate}>{formatDateTime(a.created_at)}</span>
                      <span className={s.attemptMethod}>
                        {METHODS[a.method]?.label ?? a.method}
                        {a.via_email && <span className={s.attemptVia}> · QR envoyé par e-mail</span>}
                      </span>
                      <span className={s.attemptAmount}>{formatCents(a.amount)}</span>
                      <Chip tone={st.tone}>{st.label}</Chip>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
