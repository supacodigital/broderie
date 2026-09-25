import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronLeft, AlertCircle, Check, Truck, Lock, RefreshCw, CreditCard, Tag, X } from 'lucide-react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useCart } from '../../contexts/CartContext.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { abandonOrderPayment, createOrder } from '../../services/orders.service.js'
import { createTwintIntent, createCardIntent, syncPayment } from '../../services/payments.service.js'
import { validateCoupon } from '../../services/coupons.service.js'
import { getAddresses } from '../../services/addresses.service.js'
import { getShippingRate } from '../../services/shipping.service.js'
import { roundCHF, salePercent } from '../../utils/chf.js'
import { lineQuantityLabel } from '../../utils/stock.js'
import { POSTAL_LIMITS, SWISS_ZIP_REGEX } from '../../utils/postalAddress.js'
import s from './Checkout.module.css'

/* Chargement différé de Stripe — singleton garanti.
   Null si aucune clé n'est configurée : loadStripe('') déclenche quand même une
   requête vers js.stripe.com, bloquée par la CSP (script-src 'self') et inutile
   tant que carte/Twint sont désactivés (MVP facture-only). */
const stripeKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY
const stripePromise = stripeKey ? loadStripe(stripeKey) : null

/* État du parcours conservé pendant l'étape de paiement carte / Twint, pour
   survivre à un rechargement et à la redirection vers l'app Twint. */
const CHECKOUT_SESSION_KEYS = [
  'checkout_step', 'checkout_order_id', 'checkout_order_total', 'checkout_subtotal',
  'checkout_items', 'checkout_shipping', 'checkout_discount',
]
const clearCheckoutSession = () => {
  for (const key of CHECKOUT_SESSION_KEYS) sessionStorage.removeItem(key)
}

// Statuts d'une commande encore payable en ligne
const UNPAID_ORDER_STATUSES = ['pending', 'awaiting_payment', 'payment_failed']

/* ── Cantons suisses — code officiel à 2 lettres + nom (26 cantons, ordre alphabétique du code) ── */
const SWISS_CANTONS = [
  { code: 'AG', name: 'Argovie' },
  { code: 'AI', name: 'Appenzell Rhodes-Intérieures' },
  { code: 'AR', name: 'Appenzell Rhodes-Extérieures' },
  { code: 'BE', name: 'Berne' },
  { code: 'BL', name: 'Bâle-Campagne' },
  { code: 'BS', name: 'Bâle-Ville' },
  { code: 'FR', name: 'Fribourg' },
  { code: 'GE', name: 'Genève' },
  { code: 'GL', name: 'Glaris' },
  { code: 'GR', name: 'Grisons' },
  { code: 'JU', name: 'Jura' },
  { code: 'LU', name: 'Lucerne' },
  { code: 'NE', name: 'Neuchâtel' },
  { code: 'NW', name: 'Nidwald' },
  { code: 'OW', name: 'Obwald' },
  { code: 'SG', name: 'Saint-Gall' },
  { code: 'SH', name: 'Schaffhouse' },
  { code: 'SO', name: 'Soleure' },
  { code: 'SZ', name: 'Schwytz' },
  { code: 'TG', name: 'Thurgovie' },
  { code: 'TI', name: 'Tessin' },
  { code: 'UR', name: 'Uri' },
  { code: 'VD', name: 'Vaud' },
  { code: 'VS', name: 'Valais' },
  { code: 'ZG', name: 'Zoug' },
  { code: 'ZH', name: 'Zurich' },
]
const CANTON_CODES = SWISS_CANTONS.map(c => c.code)

/* ── Schéma Zod adresse ──
   Livraison toujours requise. Facturation requise uniquement si « identique » décoché :
   les champs billing_* sont validés conditionnellement via superRefine. */
function buildAddressSchema(t) {
  /* Longueurs maximales La Poste — au-delà, l'étiquette colis tronque l'adresse */
  const tooLong = (max) => t('checkout.errors.tooLong', { max })
  const required = {
    first_name:    z.string().min(1, t('checkout.errors.firstNameRequired')).max(POSTAL_LIMITS.name, tooLong(POSTAL_LIMITS.name)),
    last_name:     z.string().min(1, t('checkout.errors.lastNameRequired')).max(POSTAL_LIMITS.name, tooLong(POSTAL_LIMITS.name)),
    street:        z.string().min(1, t('checkout.errors.streetRequired')).max(POSTAL_LIMITS.street, tooLong(POSTAL_LIMITS.street)),
    street_number: z.string().min(1, t('checkout.errors.streetNumberRequired')).max(POSTAL_LIMITS.streetNumber, tooLong(POSTAL_LIMITS.streetNumber)),
    zip:        z.string().regex(SWISS_ZIP_REGEX, t('checkout.errors.zipInvalid')),
    city:       z.string().min(1, t('checkout.errors.cityRequired')).max(POSTAL_LIMITS.city, tooLong(POSTAL_LIMITS.city)),
    canton:     z.string().refine(v => CANTON_CODES.includes(v), t('checkout.errors.cantonRequired')),
  }
  return z.object({
    ...required,
    phone: z.string().optional(),
    /* Facturation identique à la livraison — case cochée par défaut */
    billing_same:       z.boolean().default(true),
    billing_first_name: z.string().optional(),
    billing_last_name:  z.string().optional(),
    billing_street:     z.string().optional(),
    billing_street_number: z.string().optional(),
    billing_zip:        z.string().optional(),
    billing_city:       z.string().optional(),
    billing_canton:     z.string().optional(),
  }).superRefine((data, ctx) => {
    if (data.billing_same) return
    /* Facturation distincte → mêmes règles que la livraison sur les champs billing_* */
    const addErr = (field, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message })
    // Champ obligatoire ET limité en longueur (normes La Poste)
    const checkText = (field, requiredMessage, max) => {
      const value = data[field] ?? ''
      if (!value.trim()) addErr(field, requiredMessage)
      else if (value.length > max) addErr(field, tooLong(max))
    }
    checkText('billing_first_name',    t('checkout.errors.firstNameRequired'),    POSTAL_LIMITS.name)
    checkText('billing_last_name',     t('checkout.errors.lastNameRequired'),     POSTAL_LIMITS.name)
    checkText('billing_street',        t('checkout.errors.streetRequired'),       POSTAL_LIMITS.street)
    checkText('billing_street_number', t('checkout.errors.streetNumberRequired'), POSTAL_LIMITS.streetNumber)
    if (!SWISS_ZIP_REGEX.test(data.billing_zip ?? '')) addErr('billing_zip', t('checkout.errors.zipInvalid'))
    checkText('billing_city',          t('checkout.errors.cityRequired'),         POSTAL_LIMITS.city)
    if (!CANTON_CODES.includes(data.billing_canton ?? '')) addErr('billing_canton', t('checkout.errors.cantonRequired'))
  })
}

/* ── Stepper ── */
function Stepper({ step, t }) {
  const steps = [
    t('checkout.stepAddress'),
    t('checkout.stepSummary'),
    t('checkout.stepConfirm'),
  ]
  return (
    <div className={s.stepper} aria-label="Étapes de commande">
      {steps.map((label, i) => (
        <span key={label} className={s.stepperSpan}>
          <div className={`${s.step} ${i + 1 === step ? s.active : ''} ${i + 1 < step ? s.done : ''}`}>
            <span className={s.stepNum}>
              {i + 1 < step ? <Check size={13} /> : i + 1}
            </span>
            <span>{label}</span>
          </div>
          {i < steps.length - 1 && <div className={s.stepDivider} />}
        </span>
      ))}
    </div>
  )
}

/* ── Mini récapitulatif (colonne droite) ── */
function OrderSummary({ items, subtotal, discount, couponCode, shipping, shippingLoading, shippingError, onRetryShipping, confirmedTotal, t }) {
  const discounted = roundCHF(subtotal - (discount ?? 0))
  /* Commande créée : le total affiché est celui du serveur, exactement celui que
     Stripe encaisse — plus un recalcul qui pourrait s'en écarter (remise perdue
     au rechargement, frais de port illisibles). */
  const total      = confirmedTotal != null
    ? roundCHF(parseFloat(confirmedTotal))
    : shipping ? roundCHF(discounted + shipping.price_chf) : null
  return (
    <aside className={s.summary}>
      <h2 className={s.summaryTitle}>{t('checkout.summaryTitle')}</h2>

      {items.map(item => (
        <div key={item.id} className={s.summaryItem}>
          <span className={s.summaryItemName}>
            {item.product_icon && `${item.product_icon} `}
            {item.product_name}
            {item.variant_value && (
              <span className={s.summaryItemQty}> — {item.variant_value}</span>
            )}
            {item.is_made_to_order ? (
              <span className={s.summaryMadeToOrder}>{t('products.madeToOrder')}</span>
            ) : null}
            {/* Article en action (CLI-14) */}
            {salePercent(item.unit_price, item.compare_unit_price) > 0 && (
              <span className={s.summaryOnSale}>
                {t('cart.onSale', { percent: salePercent(item.unit_price, item.compare_unit_price) })}
              </span>
            )}
          </span>
          {/* Article à la coupe : la longueur (« 60 cm »), pas le nombre de tronçons */}
          <span className={s.summaryItemQty}>{item.sold_by_length ? lineQuantityLabel(item) : `×${item.quantity}`}</span>
          <span className={s.summaryItemPrice}>
            {salePercent(item.unit_price, item.compare_unit_price) > 0 && (
              <span className={s.summaryItemPriceOld}>
                CHF {roundCHF(item.compare_unit_price * item.quantity).toFixed(2)}
              </span>
            )}
            CHF {roundCHF(item.unit_price * item.quantity).toFixed(2)}
          </span>
        </div>
      ))}

      <hr className={s.summaryDivider} />

      <div className={s.summaryRow}>
        <span>{t('checkout.subtotal')}</span>
        <span>CHF {subtotal.toFixed(2)}</span>
      </div>

      {discount > 0 && (
        <div className={s.summaryRowDiscount}>
          <span><Tag size={12} className={s.couponTagIcon} />{couponCode}</span>
          <span>− CHF {discount.toFixed(2)}</span>
        </div>
      )}

      <div className={s.summaryRow}>
        <span>
          {t('checkout.shipping')}
          {shipping && <span className={s.summaryCarrier}> · {shipping.carrier} · {shipping.estimated_days}j</span>}
        </span>
        <span>
          {shippingLoading
            ? <span className={s.shippingLoading}>…</span>
            : shipping
              ? (shipping.price_chf === 0 ? t('checkout.shippingFree') : `CHF ${shipping.price_chf.toFixed(2)}`)
              : '—'
          }
        </span>
      </div>

      {/* Échec du calcul des frais : le client doit pouvoir réessayer plutôt que
          rester devant un total incalculable (et la commande est bloquée en amont). */}
      {shippingError && !shippingLoading && (
        <div className={s.shippingErrorRow} role="alert">
          <AlertCircle size={13} aria-hidden="true" />
          <span>{t('checkout.shippingError')}</span>
          {onRetryShipping && (
            <button type="button" className={s.shippingRetryBtn} onClick={onRetryShipping}>
              <RefreshCw size={12} aria-hidden="true" />{t('checkout.retry')}
            </button>
          )}
        </div>
      )}

      <hr className={s.summaryDivider} />

      <div className={s.summaryTotal}>
        <span>{t('checkout.total')}</span>
        <span>{total !== null ? `CHF ${total.toFixed(2)}` : '…'}</span>
      </div>
      <p className={s.taxNote}>{t('checkout.taxLine')}</p>
    </aside>
  )
}

/* ── Champ de formulaire accessible ──
   Gère label + astérisque obligatoire (ou mention « optionnel »),
   liaison aria-describedby vers le message d'erreur, aria-invalid,
   et role=alert pour annonce lecteur d'écran. */
function Field({
  id, label, error, required = false, register, name,
  t, className = '', children, ...inputProps
}) {
  const errorId = `${id}-error`
  return (
    <div className={`${s.field} ${className}`}>
      <label htmlFor={id} className={s.label}>
        {label}
        {required ? (
          <>
            <span className={s.requiredMark} aria-hidden="true"> *</span>
            <span className={s.srOnly}> ({t('form.requiredField')})</span>
          </>
        ) : (
          <span className={s.optionalMark}> ({t('form.optional')})</span>
        )}
      </label>
      {children ?? (
        <input
          id={id}
          className={`${s.input} ${error ? s.error : ''}`}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          {...(register ? register(name) : {})}
          {...inputProps}
        />
      )}
      {error && (
        <span id={errorId} className={s.fieldError} role="alert">
          <AlertCircle size={12} aria-hidden="true" />{error.message}
        </span>
      )}
    </div>
  )
}

/* ── Bloc de champs d'adresse réutilisable (livraison ou facturation) ──
   `prefix` distingue les deux jeux de champs : '' pour la livraison, 'billing_' pour la facturation.
   `idPrefix` génère des id uniques ('co-' / 'bill-'). */
function AddressFields({ prefix = '', idPrefix, register, errors, t }) {
  const f = (name) => `${prefix}${name}`
  const cantonId = `${idPrefix}canton`
  return (
    <>
      <div className={s.row}>
        <Field id={`${idPrefix}first`} name={f('first_name')} required register={register} t={t}
          label={t('checkout.firstName')} error={errors[f('first_name')]}
          type="text" autoComplete="given-name" />
        <Field id={`${idPrefix}last`} name={f('last_name')} required register={register} t={t}
          label={t('checkout.lastName')} error={errors[f('last_name')]}
          type="text" autoComplete="family-name" />
      </div>

      <div className={s.rowStreet}>
        <Field id={`${idPrefix}street`} name={f('street')} required register={register} t={t}
          label={t('checkout.street')} error={errors[f('street')]}
          type="text" autoComplete="address-line1"
          placeholder={t('checkout.streetPlaceholder')} />
        <Field id={`${idPrefix}streetNumber`} name={f('street_number')} required register={register} t={t}
          label={t('checkout.streetNumber')} error={errors[f('street_number')]}
          type="text" autoComplete="off"
          placeholder={t('checkout.streetNumberPlaceholder')} />
      </div>

      <div className={s.rowThree}>
        <Field id={`${idPrefix}zip`} name={f('zip')} required register={register} t={t}
          label={t('checkout.zip')} error={errors[f('zip')]}
          type="text" autoComplete="postal-code" maxLength={4} inputMode="numeric"
          placeholder={t('checkout.zipPlaceholder')} />
        <Field id={`${idPrefix}city`} name={f('city')} required register={register} t={t}
          label={t('checkout.city')} error={errors[f('city')]}
          type="text" autoComplete="address-level2"
          placeholder={t('checkout.cityPlaceholder')} />
        <Field id={cantonId} name={f('canton')} required error={errors[f('canton')]} t={t}
          label={t('checkout.canton')}>
          <select
            id={cantonId}
            className={`${s.input} ${s.select} ${errors[f('canton')] ? s.error : ''}`}
            aria-invalid={errors[f('canton')] ? 'true' : undefined}
            aria-describedby={errors[f('canton')] ? `${cantonId}-error` : undefined}
            {...register(f('canton'))}
          >
            <option value="" disabled>{t('checkout.cantonSelect')}</option>
            {SWISS_CANTONS.map(c => (
              <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
            ))}
          </select>
        </Field>
      </div>
    </>
  )
}

/* ── Étape 1 : Adresse de livraison + facturation ── */
function StepAddress({ onNext, prefill, savedAddresses, t }) {
  const { register, handleSubmit, reset, setFocus, watch, getValues, formState: { errors } } = useForm({
    resolver: zodResolver(buildAddressSchema(t)),
    defaultValues: {
      first_name: '', last_name: '', street: '', street_number: '', zip: '', city: '', canton: '', phone: '',
      billing_same: true,
      billing_first_name: '', billing_last_name: '', billing_street: '', billing_street_number: '',
      billing_zip: '', billing_city: '', billing_canton: '',
    },
  })

  /* Adresse de facturation identique à la livraison ? (case cochée par défaut) */
  const billingSame = watch('billing_same')

  /* Focus programmatique sur le 1er champ en erreur à la soumission (WCAG) */
  const onInvalid = (formErrors) => {
    const first = Object.keys(formErrors)[0]
    if (first) setFocus(first)
  }

  /* Préremplissage dès que les données du compte sont disponibles — préserve les champs facturation */
  useEffect(() => {
    if (!prefill) return
    reset({
      ...getValues(),
      first_name: prefill.firstName ?? '',
      last_name:  prefill.lastName  ?? '',
      street:     prefill.street    ?? '',
      street_number: prefill.streetNumber ?? '',
      zip:        prefill.zip       ?? '',
      city:       prefill.city      ?? '',
      canton:     prefill.canton    ?? '',
      phone:      prefill.phone     ?? '',
    })
  }, [prefill, reset, getValues])

  /* Sélection d'une adresse sauvegardée → prérempli le formulaire de livraison */
  const fillFromSaved = (addr) => {
    reset({
      ...getValues(),
      first_name: addr.first_name ?? prefill?.firstName ?? '',
      last_name:  addr.last_name  ?? prefill?.lastName  ?? '',
      street:     addr.street ?? '',
      street_number: addr.street_number ?? '',
      zip:        addr.zip    ?? '',
      city:       addr.city   ?? '',
      canton:     addr.canton ?? '',
    })
  }

  return (
    <div className={s.panel}>
      <h2 className={s.panelTitle}>{t('checkout.addressTitle')}</h2>

      {/* Sélection rapide d'une adresse sauvegardée */}
      {savedAddresses.length > 0 && (
        <div className={s.savedAddresses}>
          <p className={s.savedAddressesLabel}>{t('checkout.savedAddresses')}</p>
          <div className={s.savedAddressList}>
            {savedAddresses.map(addr => (
              <button
                key={addr.id}
                type="button"
                className={s.savedAddressBtn}
                onClick={() => fillFromSaved(addr)}
              >
                <span className={s.savedAddrLabel}>{addr.label || addr.city}</span>
                <span className={s.savedAddrLine}>{addr.street} {addr.street_number}, {addr.zip} {addr.city}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Légende champs obligatoires */}
      <p className={s.requiredLegend}>
        {t('form.requiredLegend')} <span className={s.requiredMark} aria-hidden="true">*</span> {t('form.requiredMark')}.
      </p>

      <form onSubmit={handleSubmit(onNext, onInvalid)} noValidate className={s.form}>

        {/* ── Adresse de livraison ── */}
        <AddressFields prefix="" idPrefix="co-" register={register} errors={errors} t={t} />

        {/* Pays non demandé — livraison Suisse uniquement (défaut 'CH' côté serveur) */}
        <Field id="co-phone" name="phone" register={register} t={t}
          label={t('checkout.phone')}
          type="tel" autoComplete="tel"
          placeholder={t('checkout.phonePlaceholder')} />

        {/* ── Adresse de facturation ── */}
        <div className={s.billingToggle}>
          <input
            id="co-billing-same"
            type="checkbox"
            className={s.checkbox}
            {...register('billing_same')}
          />
          <label htmlFor="co-billing-same" className={s.billingToggleLabel}>
            {t('checkout.billingSame')}
          </label>
        </div>

        {!billingSame && (
          <fieldset className={s.billingFieldset}>
            <legend className={s.billingLegend}>{t('checkout.billingTitle')}</legend>
            <AddressFields prefix="billing_" idPrefix="bill-" register={register} errors={errors} t={t} />
          </fieldset>
        )}

        <div className={s.actions}>
          <Link to="/panier" className={s.btnBack}>
            <ChevronLeft size={16} />{t('cart.title')}
          </Link>
          <button type="submit" className={s.btnPrimary}>
            {t('checkout.continueToSummary')} <ChevronRight size={16} />
          </button>
        </div>
      </form>
    </div>
  )
}

/* ── Étape 2 : Mode de paiement + CGV ── */
function StepSummary({ address, billingAddress, onBack, onSubmit, isSubmitting, globalError, subtotal, onCouponApplied, discount, couponCode, onPaymentChange, totalKnown = true, t }) {
  /* La facturation diffère-t-elle de la livraison ? (comparaison des champs clés) */
  const billingDiffers = billingAddress && (
    billingAddress.street !== address.street ||
    billingAddress.street_number !== address.street_number ||
    billingAddress.zip    !== address.zip ||
    billingAddress.city   !== address.city ||
    billingAddress.first_name !== address.first_name ||
    billingAddress.last_name  !== address.last_name
  )
  const [payment,     setPayment]     = useState('invoice_qr')
  const [cgv,         setCgv]         = useState(false)
  const [cgvError,    setCgvError]    = useState('')
  /* Facture papier jointe au colis — l'envoi du PDF par email a lieu dans tous les cas */
  const [printedInvoice, setPrintedInvoice] = useState(false)
  const [couponInput, setCouponInput] = useState('')
  const [couponError, setCouponError] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)

  /* Moyens de paiement proposés à la cliente.

     Twint d'abord : c'est le moyen le plus utilisé en Suisse, et le premier
     attendu par la boutique. La facture reste en bonne place, très demandée en
     vente à distance suisse.

     Twint et la carte passent par Stripe. Si la clé Stripe manque côté serveur,
     la création du paiement échoue avec un message clair plutôt que de laisser
     la cliente sur un écran vide — mais ces deux options ne doivent être
     ouvertes qu'une fois le compte Stripe en production réellement actif. */
  const PAYMENT_OPTIONS = [
    { value: 'twint',      label: t('checkout.paymentTwint'),   badge: '📱' },
    { value: 'card',       label: t('checkout.paymentCard'),    badge: '💳' },
    { value: 'invoice_qr', label: t('checkout.paymentInvoice'), badge: '🧾' },
    { value: 'pickup',     label: t('checkout.paymentPickup'),  badge: '🏬' },
  ]

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return
    setCouponError('')
    setCouponLoading(true)
    try {
      const res = await validateCoupon(couponInput.trim(), subtotal)
      const couponData = res.data ?? res
      onCouponApplied({ discount: couponData.discount, code: couponData.code })
      setCouponInput('')
    } catch (err) {
      const msg = err.response?.data?.message ?? err.message ?? t('checkout.couponInvalid')
      setCouponError(msg)
    } finally {
      setCouponLoading(false)
    }
  }

  const handleRemoveCoupon = () => {
    onCouponApplied({ discount: 0, code: '' })
    setCouponInput('')
    setCouponError('')
  }

  /* `disabled={isSubmitting}` seul ne suffit pas : entre le clic et le re-render qui
     propage l'état depuis le parent, un double-clic rapide passe et crée deux commandes.
     Ce verrou synchrone ferme la fenêtre. */
  const submitLock = useRef(false)

  const handleConfirm = () => {
    if (submitLock.current) return
    if (!cgv) { setCgvError(t('checkout.errors.cgvRequired')); return }
    setCgvError('')
    submitLock.current = true
    Promise.resolve(onSubmit({ payment_method: payment, wants_printed_invoice: printedInvoice }))
      .finally(() => { submitLock.current = false })
  }

  return (
    <div className={s.panel}>
      <h2 className={s.panelTitle}>{t('checkout.paymentMethod')}</h2>

      {globalError && (
        <div className={s.globalError} role="alert">
          <AlertCircle size={16} aria-hidden="true" />{globalError}
        </div>
      )}

      {/* Récap adresse de livraison */}
      <div className={s.addressRecap}>
        <p className={s.addressRecapLabel}>{t('checkout.deliveryTo')}</p>
        <p className={s.addressRecapValue}>
          {/* Format La Poste : « NPA Localité », sans canton ni pays */}
          {address.first_name} {address.last_name} — {address.street} {address.street_number}, {address.zip} {address.city}
        </p>
      </div>

      {/* Récap adresse de facturation — affiché uniquement si différente */}
      {billingDiffers && (
        <div className={s.addressRecap}>
          <p className={s.addressRecapLabel}>{t('checkout.billingTo')}</p>
          <p className={s.addressRecapValue}>
            {billingAddress.first_name} {billingAddress.last_name} — {billingAddress.street} {billingAddress.street_number}, {billingAddress.zip} {billingAddress.city}
          </p>
        </div>
      )}

      {/* Options de paiement */}
      <div className={s.paymentOptions} role="group" aria-label={t('checkout.paymentMethod')}>
        {PAYMENT_OPTIONS.map(opt => (
          <label
            key={opt.value}
            className={`${s.paymentOption} ${payment === opt.value ? s.selected : ''}`}
          >
            <input
              type="radio"
              name="payment"
              value={opt.value}
              checked={payment === opt.value}
              onChange={() => { setPayment(opt.value); onPaymentChange?.(opt.value) }}
              className={s.paymentRadio}
            />
            <div className={s.paymentOptionInner}>
              <p className={s.paymentLabel}>{opt.label}</p>
            </div>
            <span className={s.paymentBadge}>{opt.badge}</span>
          </label>
        ))}
      </div>

      {/* Info contextuelle selon le mode choisi */}
      {payment === 'twint' && (
        <div className={s.paymentInfo}>{t('checkout.infoTwint')}</div>
      )}
      {payment === 'card' && (
        <div className={s.paymentInfo}>{t('checkout.infoCard')}</div>
      )}
      {payment === 'invoice_qr' && (
        <div className={s.paymentInfo}>{t('checkout.infoInvoice')}</div>
      )}
      {payment === 'pickup' && (
        <div className={s.paymentInfo}>{t('checkout.infoPickup')}</div>
      )}

      {/* Code promo */}
      <div className={s.couponSection}>
        <h3 className={s.couponTitle}><Tag size={14} /> {t('checkout.couponLabel')}</h3>
        {couponCode ? (
          <div className={s.couponApplied}>
            <Tag size={14} />
            <span><strong>{couponCode}</strong> — − CHF {(discount ?? 0).toFixed(2)}</span>
            <button type="button" className={s.couponRemove} onClick={handleRemoveCoupon} aria-label="Retirer le code">
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className={s.couponRow}>
            <input
              type="text"
              className={s.couponInput}
              placeholder={t('checkout.couponPlaceholder')}
              value={couponInput}
              onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError('') }}
              onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
            />
            <button
              type="button"
              className={s.couponBtn}
              onClick={handleApplyCoupon}
              disabled={couponLoading || !couponInput.trim()}
            >
              {couponLoading ? '…' : t('checkout.couponApply')}
            </button>
          </div>
        )}
        {couponError && (
          <span className={s.fieldError} role="alert"><AlertCircle size={12} aria-hidden="true" />{couponError}</span>
        )}
      </div>

      {/* Facture papier — option, sans incidence sur l'envoi du PDF par email */}
      <div className={s.printedInvoiceRow}>
        <input
          id="checkout-printed-invoice"
          type="checkbox"
          className={s.checkbox}
          checked={printedInvoice}
          onChange={e => setPrintedInvoice(e.target.checked)}
        />
        <label htmlFor="checkout-printed-invoice" className={s.printedInvoiceLabel}>
          {t('checkout.printedInvoice')}
          <span className={s.printedInvoiceHint}>{t('checkout.printedInvoiceHint')}</span>
        </label>
      </div>

      {/* CGV — encadré cliquable, plus visible que l'option « facture imprimée »
          juste au-dessus : c'est la seule case obligatoire de l'étape, et elle
          passait inaperçue en petit texte gris (retour de Christophe, 25.09). */}
      <label
        htmlFor="checkout-cgv"
        className={`${s.cgvRow} ${s.cgvRowSpaced}`}
        data-checked={cgv ? 'true' : undefined}
        data-invalid={cgvError ? 'true' : undefined}
      >
        <input
          id="checkout-cgv"
          type="checkbox"
          className={`${s.checkbox} ${s.cgvCheckbox}`}
          checked={cgv}
          aria-invalid={cgvError ? 'true' : undefined}
          aria-describedby={cgvError ? 'checkout-cgv-error' : undefined}
          onChange={e => { setCgv(e.target.checked); if (e.target.checked) setCgvError('') }}
        />
        <span className={s.cgvLabel}>
          {t('checkout.cgvAccept')}{' '}
          <Link to="/cgv">{t('checkout.cgvLink')}</Link>
          <span className={s.requiredMark} aria-hidden="true"> *</span>
        </span>
      </label>
      {cgvError && (
        <span id="checkout-cgv-error" className={`${s.fieldError} ${s.fieldErrorSpaced}`} role="alert">
          <AlertCircle size={12} aria-hidden="true" />{cgvError}
        </span>
      )}

      <div className={`${s.actions} ${s.actionsSpaced}`}>
        <button type="button" className={s.btnBack} onClick={onBack}>
          <ChevronLeft size={16} />{t('checkout.backToAddress')}
        </button>
        <button
          type="button"
          className={s.btnPrimary}
          onClick={handleConfirm}
          /* totalKnown : interdit de valider une commande dont le montant n'a pas
             pu être calculé (frais de port indisponibles) — le client doit toujours
             voir le total avant de s'engager. */
          disabled={isSubmitting || !totalKnown}
        >
          {isSubmitting
            ? t('checkout.placingOrder')
            : <><Lock size={15} />{t('checkout.placeOrder')}</>
          }
        </button>
      </div>
    </div>
  )
}

/* ── Formulaire Twint interne (doit être enfant de <Elements>) ── */
function TwintForm({ orderId, onPaid, t }) {
  const stripe   = useStripe()
  const elements = useElements()
  const [error,      setError]      = useState('')
  const [processing, setProcessing] = useState(false)
  /* Formulaire Stripe prêt / en échec de chargement (réseau, bloqueur de
     publicités, panne Stripe) : sans ce suivi, la cliente voyait un bouton
     « Payer » sans aucun champ ni explication. */
  const [ready,      setReady]      = useState(false)
  const [loadError,  setLoadError]  = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setError('')
    setProcessing(true)
    try {
      const { error: stripeErr } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/commande?order=${orderId}`,
        },
        redirect: 'if_required',
      })
      if (stripeErr) {
        setError(stripeErr.message ?? t('checkout.errors.twintRefused'))
        // Le refus est inscrit sur la commande sans attendre le webhook (CLI-07)
        syncPayment(orderId).catch(() => {})
      } else {
        onPaid()
      }
    } catch {
      setError(t('checkout.errors.twintConfirm'))
    } finally {
      setProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Le pays de facturation est proposé sur la Suisse : sans consigne, Stripe
          le déduit de l'adresse réseau et affichait « France » à des clientes
          suisses. La liste reste ouverte — la boutique livre en Suisse mais une
          carte peut être émise ailleurs. */}
      <PaymentElement
        options={{ defaultValues: { billingDetails: { address: { country: 'CH' } } } }}
        onReady={() => setReady(true)}
        onLoadError={() => setLoadError(true)}
      />
      {loadError && (
        <div className={s.twintError} role="alert">
          <AlertCircle size={16} />{t('checkout.errors.paymentFormLoad')}
        </div>
      )}
      {error && (
        <div className={s.twintError} role="alert">
          <AlertCircle size={16} />{error}
        </div>
      )}
      <button
        type="submit"
        className={`${s.btnPrimary} ${s.btnFullWidth}`}
        disabled={!stripe || processing || !ready || loadError}
      >
        {processing
          ? t('checkout.processing')
          : <><Lock size={15} />{t('checkout.confirmTwintBtn')}</>
        }
      </button>
    </form>
  )
}

/* ── Étape Twint : paiement via Stripe.js (redirection vers l'app Twint, sans QR) ── */
function StepTwint({ orderId, total, onPaid, t }) {
  const [clientSecret, setClientSecret] = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')

  /* Le serveur n'autorise qu'UNE demande de paiement par commande dans une fenêtre
     de 30 secondes : deux appels simultanés créeraient deux paiements pour la même
     commande. Le second reçoit donc un 409, et c'est sa réponse qui pilote
     l'affichage — le formulaire de paiement ne s'affichait jamais.

     React exécute les effets deux fois au montage en mode strict, et un remontage
     du composant produit le même résultat. Ce garde-fou n'autorise donc qu'un seul
     appel pour une commande donnée. */
  const requestedRef = useRef(null)

  const fetchIntent = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await createTwintIntent(orderId)
      setClientSecret(res.clientSecret)
    } catch (err) {
      // Le motif du serveur (Twint non activé, commande déjà réglée…) est plus
      // utile à la cliente qu'un message générique identique pour tous les cas.
      setError(err.response?.data?.message ?? t('checkout.errors.twintInit'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // `orderId` vient de sessionStorage sous forme de chaîne après un rechargement,
    // et de l'état sous forme de nombre : on compare les deux en texte.
    if (requestedRef.current === String(orderId)) return
    requestedRef.current = String(orderId)
    fetchIntent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  /* Réessai manuel : on relâche le garde-fou, la fenêtre serveur de 30 s ayant
     le temps de se libérer pendant que la personne lit le message d'erreur. */
  const retry = () => {
    requestedRef.current = String(orderId)
    fetchIntent()
  }

  const stripeAppearance = {
    theme: 'stripe',
    variables: {
      colorPrimary:    '#be185d',
      colorBackground: '#ffffff',
      colorText:       '#1a0a1e',
      borderRadius:    '10px',
    },
  }

  return (
    <div className={s.twintWrap}>
      <h2 className={s.twintTitle}>{t('checkout.twintTitle')}</h2>
      <p className={s.twintDesc}>
        {t('checkout.twintPay', { amount: roundCHF(total).toFixed(2) })}
      </p>

      {loading && (
        <div className={s.twintLoading}>
          <div className={s.twintSpinner} />
          <p>{t('checkout.initPayment')}</p>
        </div>
      )}

      {!loading && error && (
        <div className={s.twintError}>
          <AlertCircle size={16} />{error}
          <button onClick={retry} className={s.twintRetryBtn}>
            <RefreshCw size={14} /> Réessayer
          </button>
        </div>
      )}

      {!loading && !error && clientSecret && (
        <Elements
          stripe={stripePromise}
          options={{ clientSecret, appearance: stripeAppearance, locale: 'fr' }}
        >
          <TwintForm orderId={orderId} onPaid={onPaid} t={t} />
        </Elements>
      )}
    </div>
  )
}

/* ── Formulaire carte interne (doit être enfant de <Elements>) ── */
function CardForm({ orderId, total, onPaid, t }) {
  const stripe   = useStripe()
  const elements = useElements()
  const [error,       setError]       = useState('')
  const [processing,  setProcessing]  = useState(false)
  // Même suivi du chargement que pour Twint (voir TwintForm)
  const [ready,       setReady]       = useState(false)
  const [loadError,   setLoadError]   = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setError('')
    setProcessing(true)
    try {
      const { error: stripeErr } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          // Le numéro de commande permet de retrouver le paiement au retour de
          // 3-D Secure, même si l'onglet a perdu son état entre-temps.
          return_url: `${window.location.origin}/commande?order=${orderId}`,
        },
        redirect: 'if_required',
      })
      if (stripeErr) {
        setError(stripeErr.message ?? t('checkout.errors.cardRefused'))
        // Le refus est inscrit sur la commande sans attendre le webhook (CLI-07)
        syncPayment(orderId).catch(() => {})
      } else {
        onPaid()
      }
    } catch {
      setError(t('checkout.errors.generic'))
    } finally {
      setProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={s.cardForm}>
      {/* Le pays de facturation est proposé sur la Suisse : sans consigne, Stripe
          le déduit de l'adresse réseau et affichait « France » à des clientes
          suisses. La liste reste ouverte — la boutique livre en Suisse mais une
          carte peut être émise ailleurs. */}
      <PaymentElement
        options={{ defaultValues: { billingDetails: { address: { country: 'CH' } } } }}
        onReady={() => setReady(true)}
        onLoadError={() => setLoadError(true)}
      />
      {loadError && (
        <div className={s.cardError} role="alert">
          <AlertCircle size={14} />{t('checkout.errors.paymentFormLoad')}
        </div>
      )}
      {error && (
        <div className={s.cardError} role="alert">
          <AlertCircle size={14} />{error}
        </div>
      )}
      <button
        type="submit"
        className={`${s.btnPrimary} ${s.btnFullWidth}`}
        disabled={!stripe || processing || !ready || loadError}
      >
        {processing
          ? t('checkout.processing')
          : <><Lock size={15} />{t('checkout.payAmount', { amount: roundCHF(total).toFixed(2) })}</>
        }
      </button>
    </form>
  )
}

/* ── Étape Carte : formulaire Stripe Elements ── */
function StepCard({ orderId, total, onPaid, t }) {
  const [clientSecret, setClientSecret] = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')

  /* Même garde-fou que pour Twint : un seul appel par commande, sinon le second
     se heurte au verrou serveur (409) et le formulaire Stripe ne s'affiche pas. */
  const requestedRef = useRef(null)

  const fetchIntent = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await createCardIntent(orderId)
      setClientSecret(res.clientSecret)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Impossible d\'initialiser le paiement. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (requestedRef.current === String(orderId)) return
    requestedRef.current = String(orderId)
    fetchIntent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  const stripeAppearance = {
    theme: 'stripe',
    variables: {
      colorPrimary:       '#be185d',
      colorBackground:    '#ffffff',
      colorText:          '#1a0a1e',
      colorDanger:        '#ef4444',
      fontFamily:         'Montserrat, sans-serif',
      spacingUnit:        '4px',
      borderRadius:       '10px',
    },
  }

  return (
    <div className={s.cardWrap}>
      <div className={s.cardHeader}>
        <CreditCard size={24} className={s.cardHeaderIcon} />
        <h2 className={s.cardTitle}>Paiement par carte</h2>
        <p className={s.cardDesc}>
          Montant à régler : <strong>CHF {roundCHF(total).toFixed(2)}</strong>
        </p>
      </div>

      {loading && (
        <div className={s.cardLoading}>
          <div className={s.twintSpinner} />
          <p>{t('checkout.initPayment')}</p>
        </div>
      )}

      {/* Réessai manuel, comme pour Twint : sans lui, un incident passager au
          chargement laissait la cliente devant une page de paiement vide. */}
      {!loading && error && (
        <div className={s.cardError} role="alert">
          <AlertCircle size={14} />{error}
          <button type="button" onClick={fetchIntent} className={s.twintRetryBtn}>
            <RefreshCw size={14} /> Réessayer
          </button>
        </div>
      )}

      {!loading && !error && clientSecret && (
        <Elements
          stripe={stripePromise}
          options={{ clientSecret, appearance: stripeAppearance, locale: 'fr' }}
        >
          <CardForm orderId={orderId} total={total} onPaid={onPaid} t={t} />
        </Elements>
      )}

      <p className={s.cardSecure}>
        <Lock size={12} /> {t('checkout.cardSecured')}
      </p>
    </div>
  )
}

/* ── Étape 3 : Confirmation ── */
function StepConfirm({ orderId, orderNumber, paymentMethod, paymentPending = false, paid = false, t }) {
  /* Message de bas de page adapté à la méthode de paiement */
  const isInvoice = paymentMethod === 'invoice_qr'
  const isPickup  = paymentMethod === 'pickup'

  return (
    <div className={s.confirmWrap}>
      <div className={s.confirmIcon}><Check size={36} /></div>
      <h1 className={s.confirmTitle}>{t('checkout.confirmTitle')}</h1>
      <p className={s.confirmSubtitle}>{t('checkout.confirmSubtitle')}</p>
      {/* N° de commande = n° de facture ; un paiement encore en validation n'en a pas */}
      {orderId && orderNumber && (
        <p className={s.confirmRef}>
          {t('checkout.confirmOrderRef')} :{' '}
          <Link to={`/commandes/${orderId}`} className={s.confirmOrderLink}>
            {orderNumber}
          </Link>
        </p>
      )}

      {/* Instructions spécifiques facture QR / Click & Collect */}
      {/* Paiement Twint encore en validation chez Stripe : la commande n'est pas
          encore « payée », l'e-mail de confirmation partira à l'acceptation. */}
      {paymentPending ? (
        <p className={s.confirmDesc}>{t('checkout.confirmProcessing')}</p>
      ) : isInvoice ? (
        /* Facture déjà réglée par un QR Twint reçu par e-mail : « Réglez-la
           sous 30 jours » invitait à payer une seconde fois (audit du 25.09) */
        <p className={s.confirmDesc}>{t(paid ? 'checkout.confirmInvoicePaid' : 'checkout.confirmInvoice')}</p>
      ) : isPickup ? (
        <p className={s.confirmDesc}>{t('checkout.confirmPickup')}</p>
      ) : (
        <p className={s.confirmDesc}>{t('checkout.confirmDesc')}</p>
      )}

      {/* Bandeau livraison — masqué pour le Click & Collect (retrait en boutique) */}
      {!isPickup && (
        <div className={s.confirmDelivery}>
          <Truck size={16} /><span>{t('checkout.deliveryInfo')}</span>
        </div>
      )}

      {/* La commande qui vient d'être payée : statut, articles et facture */}
      <Link
        to={orderId ? `/commandes/${orderId}` : '/mon-compte/commandes'}
        className={`${s.btnPrimary} ${s.confirmCtaLink}`}
      >
        {t('checkout.confirmCta')}
      </Link>
    </div>
  )
}

/* ── Orchestrateur principal ── */
export default function Checkout() {
  const { t }                                        = useTranslation()
  const navigate                                     = useNavigate()
  const { items, subtotal, clearCart, reloadCart } = useCart()
  const { user, isAuthenticated }                    = useAuth()

  /* Retour d'une redirection Stripe (app Twint, 3-D Secure) : l'URL porte le
     numéro de commande et l'issue annoncée. Lu une seule fois, au chargement.
     Certains retours ne portent que `payment_intent`, sans `redirect_status`
     (audit du 25.09 : 3-D Secure rouvert dans un nouvel onglet) — la page
     reprenait alors la caisse à l'adresse pour une commande déjà payée. Le
     serveur connaît l'issue : on la lui demande dans les deux cas. */
  const [stripeReturn] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const order = params.get('order')
    const redirectStatus = params.get('redirect_status')
    return order && (redirectStatus || params.get('payment_intent'))
      ? { orderId: order, redirectStatus: redirectStatus ?? 'unknown' }
      : null
  })

  /* Restauration depuis sessionStorage après refresh à l'étape paiement */
  const [step,           setStep]           = useState(() => {
    const saved = sessionStorage.getItem('checkout_step')
    // Une étape de paiement sans commande mémorisée ne peut pas être reprise
    if (!sessionStorage.getItem('checkout_order_id')) return 1
    return saved === 'twint' || saved === 'card' ? saved : 1
  })
  const [address,        setAddress]        = useState(null)
  const [billingAddress, setBillingAddress] = useState(null)
  /* Le numéro de l'URL de retour sert de secours : l'app Twint peut rouvrir le
     site dans un nouvel onglet, où sessionStorage est vide. */
  // N° de commande affiché (= n° de facture), connu à la création ou au paiement
  const [orderNumber,    setOrderNumber]    = useState(null)
  const [orderId,        setOrderId]        = useState(() => {
    return sessionStorage.getItem('checkout_order_id') || stripeReturn?.orderId || null
  })
  /* Avant d'afficher un formulaire de paiement repris (retour de Twint, page
     rechargée), on demande au serveur où en est le paiement de la commande.
     Sans cette vérification, la page redemandait un paiement pour une commande
     déjà réglée (CLI-15). 'checking' | 'error' | 'done' */
  const [paymentCheck,   setPaymentCheck]   = useState(() => {
    const resumedPayment = sessionStorage.getItem('checkout_order_id')
      && ['twint', 'card'].includes(sessionStorage.getItem('checkout_step'))
    return stripeReturn || resumedPayment ? 'checking' : 'done'
  })
  const [paymentCheckAttempt, setPaymentCheckAttempt] = useState(0)
  const [paymentCheckError,   setPaymentCheckError]   = useState('')
  const paymentCheckRef = useRef(-1)
  // Message au-dessus du formulaire quand un paiement précédent n'a pas abouti
  const [paymentNotice,  setPaymentNotice]  = useState('')
  // Paiement accepté mais encore en validation chez Stripe (Twint « processing »)
  const [paymentPending, setPaymentPending] = useState(false)
  // Commande déjà payée au retour d'un paiement Stripe (facture réglée par QR Twint)
  const [orderPaid,      setOrderPaid]      = useState(false)
  const [paymentMethod,  setPaymentMethod]  = useState('invoice_qr')
  /* Méthode en cours de sélection à l'étape 2 (défaut 'invoice_qr' = défaut du radio) — sert au récap (frais à 0 si Click & Collect) */
  const [selectedMethod, setSelectedMethod] = useState('invoice_qr')
  const [orderTotal,     setOrderTotal]     = useState(() => {
    return parseFloat(sessionStorage.getItem('checkout_order_total') || '0')
  })
  const [isSubmitting,   setIsSubmitting]   = useState(false)
  const [isLeavingPayment, setIsLeavingPayment] = useState(false)
  const [globalError,    setGlobalError]    = useState('')
  const [prefill,        setPrefill]        = useState(null)
  const [savedAddresses, setSavedAddresses] = useState([])
  /* Remise figée à la création de commande — reprise au rechargement de l'étape
     de paiement, sinon le récapitulatif montrait articles + port au-dessus d'un
     total plus bas, sans la ligne de remise qui l'explique. */
  const savedDiscount = (() => {
    // Seulement en reprise d'une étape de paiement : jamais dans un nouveau parcours
    if (!['card', 'twint'].includes(sessionStorage.getItem('checkout_step'))) return null
    try { return JSON.parse(sessionStorage.getItem('checkout_discount') ?? 'null') } catch { return null }
  })()
  const [discount,        setDiscount]       = useState(() => Number(savedDiscount?.discount) || 0)
  const [couponCode,      setCouponCode]     = useState(() => savedDiscount?.code ?? '')
  /* Frais de port — chargés dynamiquement depuis l'API à l'étape 2 */
  const [shipping,        setShipping]        = useState(null)
  const [shippingLoading, setShippingLoading] = useState(false)
  const [shippingError,   setShippingError]   = useState(false)
  const [shippingRetry,   setShippingRetry]   = useState(0)
  /* Sous-total brut avant remise — figé lors de la création de commande, et
     restauré après un rechargement au même titre que le total : le panier est
     vidé dès la commande créée, donc sans cette reprise le récapitulatif
     affichait « CHF 0.00 » à côté d'un montant à payer correct. */
  const [subtotalSnapshot, setSubtotalSnapshot] = useState(() => {
    return parseFloat(sessionStorage.getItem('checkout_subtotal') || '0')
  })
  /* Snapshot des articles avant vidage du panier */
  const [itemsSnapshot,  setItemsSnapshot]  = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('checkout_items') || '[]')
    } catch {
      return []
    }
  })
  /* Frais de port figés à la création de commande — même raison */
  /* Stocké en JSON : l'objet des frais de port était enregistré avec String(),
     soit « [object Object] », et le récapitulatif perdait le port au rechargement
     de l'étape de paiement. Une ancienne valeur illisible est simplement ignorée. */
  const [shippingSnapshot, setShippingSnapshot] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('checkout_shipping') ?? 'null')
      return saved && typeof saved.price_chf === 'number' ? saved : null
    } catch {
      return null
    }
  })

  /* Préremplissage depuis le compte utilisateur */
  useEffect(() => {
    if (!isAuthenticated || !user) return
    let cancelled = false
    getAddresses()
      .then(res => {
        if (cancelled) return
        const addresses = res.data ?? []
        setSavedAddresses(addresses)
        const def = addresses.find(a => !!a.is_default) ?? addresses[0] ?? null
        setPrefill({
          firstName: user.firstName ?? user.first_name ?? '',
          lastName:  user.lastName  ?? user.last_name  ?? '',
          street:    def?.street ?? '',
          streetNumber: def?.street_number ?? '',
          zip:       def?.zip    ?? '',
          city:      def?.city   ?? '',
          canton:    def?.canton ?? '',
          phone:     def?.phone  ?? '',
        })
      })
      .catch(() => {
        if (!cancelled) setPrefill({
          firstName: user.firstName ?? user.first_name ?? '',
          lastName:  user.lastName  ?? user.last_name  ?? '',
        })
      })
    return () => { cancelled = true }
  }, [isAuthenticated, user])

  /* Redirection si panier vide (sauf après commande, pendant la soumission, ou
     pendant la vérification d'un paiement — le panier est vide à ce stade, la
     commande ayant été créée avant le paiement) */
  useEffect(() => {
    const isPaymentStep = step === 'twint' || step === 'card'
    if (items.length === 0 && step < 3 && !isPaymentStep && !isSubmitting && paymentCheck === 'done') {
      navigate('/panier', { replace: true })
    }
  }, [items.length, step, isSubmitting, paymentCheck, navigate])

  /* Vérification de l'état du paiement (voir `paymentCheck`).
     Une seule requête par tentative : React exécute les effets deux fois en
     développement, et le résultat de la première serait sinon ignoré. */
  useEffect(() => {
    // Toujours un numéro de commande ici : 'checking' n'est posé qu'avec lui
    if (paymentCheck !== 'checking' || !orderId) return
    if (paymentCheckRef.current === paymentCheckAttempt) return
    paymentCheckRef.current = paymentCheckAttempt

    syncPayment(orderId)
      .then(result => {
        // L'URL de retour Stripe porte le secret du paiement : on la nettoie
        if (stripeReturn) navigate('/commande', { replace: true })

        const settled = result.orderStatus === 'paid'
          || ['succeeded', 'processing'].includes(result.intentStatus)

        if (settled) {
          clearCheckoutSession()
          setPaymentMethod(result.paymentMethod)
          setOrderNumber(result.invoiceNumber ?? null)
          setPaymentPending(result.orderStatus !== 'paid')
          setOrderPaid(result.orderStatus === 'paid')
          setStep(3)
          // Les articles payés viennent de sortir du panier côté serveur
          reloadCart()
        } else if (UNPAID_ORDER_STATUSES.includes(result.orderStatus)
          && ['twint', 'card'].includes(result.paymentMethod)) {
          setPaymentMethod(result.paymentMethod)
          setOrderTotal(prev => prev || Number(result.total) || 0)
          setStep(result.paymentMethod)
          if (stripeReturn?.redirectStatus === 'failed' || result.orderStatus === 'payment_failed') {
            setPaymentNotice(t('checkout.paymentNotCompleted'))
          }
        } else {
          // Commande annulée entre-temps (délai de 2 h dépassé, abandon) : on
          // montre son état réel plutôt qu'un formulaire de paiement inutile.
          clearCheckoutSession()
          navigate(`/commandes/${orderId}`, { replace: true })
          return
        }
        setPaymentCheck('done')
      })
      .catch(err => {
        // Commande introuvable (autre compte, supprimée) : on repart de zéro
        if (err.response?.status === 404) {
          clearCheckoutSession()
          setOrderId(null)
          setStep(1)
          setPaymentCheck('done')
          return
        }
        setPaymentCheckError(err.response?.data?.message ?? t('checkout.errors.generic'))
        setPaymentCheck('error')
      })
  }, [paymentCheck, paymentCheckAttempt, orderId, stripeReturn, navigate, t, reloadCart])

  /* La cliente quitte l'étape de paiement pour naviguer ailleurs sur le site
     (retour à la boutique, « Mon panier ») : l'étape n'est pas reprise à son
     prochain passage par la caisse, qui repart de son panier — conservé
     (CLI-13). La commande impayée est libérée à la commande suivante, ou au
     bout de 2 h. Une redirection vers Twint ou un rechargement de page ne
     démontent pas la page : ils reprennent bien l'étape de paiement.
     Le délai absorbe le démontage / remontage immédiat du mode strict de React
     en développement. */
  const mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      setTimeout(() => {
        if (!mountedRef.current && ['twint', 'card'].includes(sessionStorage.getItem('checkout_step'))) {
          clearCheckoutSession()
        }
      }, 0)
    }
  }, [])

  const retryPaymentCheck = () => {
    setPaymentCheckError('')
    setPaymentCheck('checking')
    setPaymentCheckAttempt(n => n + 1)
  }

  /* Paiement accepté sur la page (sans redirection). La confirmation s'affiche
     tout de suite ; la commande est validée côté serveur sans attendre le
     webhook — s'il arrive ensuite, il ne refait rien. */
  const finishPayment = () => {
    // Puis rechargement du panier : les articles payés en sont retirés
    if (orderId) {
      syncPayment(orderId)
        .then(result => { setOrderNumber(result?.invoiceNumber ?? null); reloadCart() })
        .catch(() => {})
    }
    clearCheckoutSession()
    setStep(3)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /* Chargement des frais de port depuis l'API à l'entrée de l'étape 2 */
  useEffect(() => {
    if (step !== 2) return
    let cancelled = false
    setShippingLoading(true)
    setShippingError(false)
    // Montant des articles avant code promo (ADM-10) : un code ne change pas de tranche
    getShippingRate(subtotal)
      .then(data => { if (!cancelled) setShipping(data) })
      /* Sans cet état, le total restait bloqué sur « … » indéfiniment et le client
         pouvait valider une commande dont il n'avait jamais vu le montant. */
      .catch(() => { if (!cancelled) setShippingError(true) })
      .finally(() => { if (!cancelled) setShippingLoading(false) })
    return () => { cancelled = true }
  }, [step, subtotal, shippingRetry])

  const handleAddressNext = (data) => {
    /* Sépare l'adresse de livraison et l'adresse de facturation issues du même formulaire */
    const shipping = {
      first_name: data.first_name,
      last_name:  data.last_name,
      street:     data.street,
      street_number: data.street_number,
      zip:        data.zip,
      city:       data.city,
      canton:     data.canton,
      phone:      data.phone,
    }
    setAddress(shipping)
    /* Facturation identique → on réutilise la livraison ; sinon on prend les champs billing_* */
    setBillingAddress(data.billing_same ? shipping : {
      first_name: data.billing_first_name,
      last_name:  data.billing_last_name,
      street:     data.billing_street,
      street_number: data.billing_street_number,
      zip:        data.billing_zip,
      city:       data.billing_city,
      canton:     data.billing_canton,
    })
    setStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /* Quitter l'étape de paiement carte / Twint sans payer (CLI-07).
     La commande impayée est annulée côté serveur — stock libéré, articles remis
     au panier — puis la cliente revient au choix du moyen de paiement.
     Avant, ce bouton ramenait à l'étape 2 avec un panier déjà vidé : la page la
     renvoyait sur un panier vide, et la commande restait dans l'administration. */
  const handleLeavePayment = async () => {
    setGlobalError('')
    setIsLeavingPayment(true)
    try {
      if (orderId) await abandonOrderPayment(orderId)
    } catch (err) {
      // 404 : commande déjà annulée (délai de 2 h dépassé) — on peut repartir.
      // Tout autre refus (paiement peut-être abouti) : on reste sur place.
      if (err.response?.status !== 404) {
        setGlobalError(err.response?.data?.message ?? t('checkout.errors.generic'))
        setIsLeavingPayment(false)
        return
      }
    }
    clearCheckoutSession()
    await reloadCart()
    setOrderId(null)
    setPaymentNotice('')
    setIsLeavingPayment(false)
    // Après un rechargement de page, l'adresse saisie n'est plus en mémoire
    setStep(address ? 2 : 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePlaceOrder = async ({ payment_method, wants_printed_invoice = false }) => {
    setGlobalError('')
    setIsSubmitting(true)
    try {
      const res = await createOrder({
        address,
        billing_address: billingAddress ?? address,
        payment_method,
        wants_printed_invoice,
        coupon_code: couponCode || undefined,
        items: items.map(i => ({
          product_id: i.product_id,
          variant_id: i.variant_id ?? null,
          quantity:   i.quantity,
        })),
      })
      const newOrderId = res.data?.id ?? res.data?.order_id ?? null
      const newTotal   = res.data?.total ?? 0
      setOrderId(newOrderId)
      // Facture / retrait : numérotés dès la création ; carte / Twint au paiement
      setOrderNumber(res.data?.invoice_number ?? null)
      setPaymentMethod(payment_method)
      setOrderTotal(newTotal)
      setSubtotalSnapshot(subtotal)
      setItemsSnapshot([...items])
      setShippingSnapshot(shipping ?? null)

      if (payment_method === 'twint' || payment_method === 'card') {
        /* Persistance pour survie au refresh */
        sessionStorage.setItem('checkout_step',        payment_method)
        sessionStorage.setItem('checkout_order_id',    String(newOrderId))
        sessionStorage.setItem('checkout_order_total', String(newTotal))
        sessionStorage.setItem('checkout_subtotal',    String(subtotal))
        sessionStorage.setItem('checkout_items',       JSON.stringify(items))
        sessionStorage.setItem('checkout_shipping',    JSON.stringify(shipping ?? null))
        sessionStorage.setItem('checkout_discount',    JSON.stringify({ discount, code: couponCode }))
      }

      /* Carte / Twint : le panier est conservé jusqu'au paiement (CLI-13) — le
         serveur ne le vide plus à la création de la commande, et en retire les
         articles une fois le paiement accepté. La cliente qui revient à la
         boutique depuis l'étape de paiement retrouve donc son panier intact.
         Facture et retrait : la commande est définitive, le panier est vidé. */
      if (payment_method === 'twint') {
        setStep('twint')
      } else if (payment_method === 'card') {
        setStep('card')
      } else {
        sessionStorage.removeItem('checkout_step')
        sessionStorage.removeItem('checkout_order_id')
        sessionStorage.removeItem('checkout_order_total')
        // Étape 3 posée AVANT clearCart() : sinon le panier vide renverrait sur /panier
        setStep(3)
        clearCart()
      }

      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      const msg = err.response?.data?.message ?? t('checkout.errors.generic')
      setGlobalError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={s.page}>

      {/* Fil d'Ariane */}
      <nav className={s.breadcrumb} aria-label="Fil d'Ariane">
        <Link to="/">{t('nav.home')}</Link>
        <ChevronRight size={13} aria-hidden="true" />
        <Link to="/panier">{t('cart.title')}</Link>
        <ChevronRight size={13} aria-hidden="true" />
        <span aria-current="page">{t('checkout.title')}</span>
      </nav>

      {paymentCheck === 'done' && step !== 3 && step !== 'twint' && step !== 'card' && <h1 className={s.heading}>{t('checkout.title')}</h1>}

      {/* Stepper — toujours visible, bloqué à l'étape 2 pendant le paiement */}
      {paymentCheck === 'done' && step !== 3 && (
        <Stepper step={typeof step === 'number' ? step : 2} t={t} />
      )}

      {/* Vérification du paiement en cours — au retour de Twint notamment */}
      {paymentCheck === 'checking' && (
        <div className={s.twintLoading} role="status">
          <div className={s.twintSpinner} />
          <p>{t('checkout.checkingPayment')}</p>
        </div>
      )}
      {paymentCheck === 'error' && (
        <div className={s.twintError} role="alert">
          <AlertCircle size={16} aria-hidden="true" />{paymentCheckError}
          <button type="button" onClick={retryPaymentCheck} className={s.twintRetryBtn}>
            <RefreshCw size={14} /> {t('checkout.checkAgain')}
          </button>
        </div>
      )}

      {step === 3 && (
        <StepConfirm orderId={orderId} orderNumber={orderNumber} paymentMethod={paymentMethod} paymentPending={paymentPending} paid={orderPaid} t={t} />
      )}

      {paymentCheck === 'done' && (step === 'twint' || step === 'card') && (
        <div className={s.layout}>
          <div>
            {/* Sortie de l'étape paiement : annule la commande impayée et
                remet les articles au panier (voir handleLeavePayment). */}
            <button
              type="button"
              className={s.changePaymentBtn}
              onClick={handleLeavePayment}
              disabled={isLeavingPayment}
            >
              <ChevronLeft size={14} aria-hidden="true" />
              {isLeavingPayment ? 'Annulation…' : 'Choisir un autre moyen de paiement'}
            </button>
            {globalError && (
              <div className={s.globalError} role="alert">
                <AlertCircle size={16} aria-hidden="true" />{globalError}
              </div>
            )}

            {paymentNotice && (
              <div className={s.globalError} role="alert">
                <AlertCircle size={16} aria-hidden="true" />{paymentNotice}
              </div>
            )}

            {step === 'twint' && (
              <StepTwint orderId={orderId} total={orderTotal} onPaid={finishPayment} t={t} />
            )}
            {step === 'card' && (
              <StepCard orderId={orderId} total={orderTotal} onPaid={finishPayment} t={t} />
            )}
          </div>
          <OrderSummary items={itemsSnapshot} subtotal={subtotalSnapshot} discount={discount} couponCode={couponCode} shipping={shippingSnapshot ?? shipping} shippingLoading={false} confirmedTotal={orderTotal || null} t={t} />
        </div>
      )}

      {paymentCheck === 'done' && (step === 1 || step === 2) && (
        <div className={s.layout}>

          {step === 1 && (
            <StepAddress onNext={handleAddressNext} prefill={prefill} savedAddresses={savedAddresses} t={t} />
          )}

          {step === 2 && (
            <StepSummary
              address={address}
              billingAddress={billingAddress}
              onBack={() => { setStep(1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              onSubmit={handlePlaceOrder}
              isSubmitting={isSubmitting}
              globalError={globalError}
              subtotal={subtotal}
              discount={discount}
              couponCode={couponCode}
              onCouponApplied={({ discount: d, code: c }) => { setDiscount(d); setCouponCode(c) }}
              onPaymentChange={setSelectedMethod}
              totalKnown={selectedMethod === 'pickup' ? !!shipping : (!!shipping && !shippingError)}
              t={t}
            />
          )}

          {/* Click & Collect : retrait en boutique → frais de port à 0 dans le récap */}
          <OrderSummary
            items={items}
            subtotal={subtotal}
            discount={discount}
            couponCode={couponCode}
            /* Click & Collect : frais à 0 (aucun envoi postal). On ne force ce 0 que si
               les frais ont réellement été chargés — sinon `{...null, price_chf: 0}`
               produit un objet truthy qui ferait afficher un total ferme alors que
               l'appel est encore en cours ou a échoué. */
            shipping={selectedMethod === 'pickup' && step === 2 && shipping
              ? { ...shipping, price_chf: 0, carrier: null, estimated_days: null }
              : shipping}
            shippingLoading={shippingLoading}
            shippingError={shippingError}
            onRetryShipping={() => setShippingRetry(n => n + 1)}
            t={t}
          />
        </div>
      )}
    </div>
  )
}
