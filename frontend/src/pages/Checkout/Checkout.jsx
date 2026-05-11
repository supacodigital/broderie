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
import { createOrder } from '../../services/orders.service.js'
import { createTwintIntent, createCardIntent } from '../../services/payments.service.js'
import { validateCoupon } from '../../services/coupons.service.js'
import { getAddresses } from '../../services/addresses.service.js'
import { getShippingRate } from '../../services/shipping.service.js'
import { roundCHF } from '../../utils/chf.js'
import s from './Checkout.module.css'

/* Chargement différé de Stripe — singleton garanti */
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY ?? '')

/* ── Schéma Zod adresse ── */
function buildAddressSchema(t) {
  return z.object({
    first_name: z.string().min(1, t('checkout.errors.firstNameRequired')),
    last_name:  z.string().min(1, t('checkout.errors.lastNameRequired')),
    street:     z.string().min(1, t('checkout.errors.streetRequired')),
    zip:        z.string().regex(/^\d{4}$/, t('checkout.errors.zipInvalid')),
    city:       z.string().min(1, t('checkout.errors.cityRequired')),
    canton:     z.string().optional(),
    phone:      z.string().optional(),
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
function OrderSummary({ items, subtotal, discount, couponCode, shipping, shippingLoading, t }) {
  const discounted = roundCHF(subtotal - (discount ?? 0))
  const total      = shipping ? roundCHF(discounted + shipping.price_chf) : null
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
          </span>
          <span className={s.summaryItemQty}>×{item.quantity}</span>
          <span className={s.summaryItemPrice}>
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
            : shipping ? `CHF ${shipping.price_chf.toFixed(2)}` : '…'
          }
        </span>
      </div>

      <hr className={s.summaryDivider} />

      <div className={s.summaryTotal}>
        <span>{t('checkout.total')}</span>
        <span>{total !== null ? `CHF ${total.toFixed(2)}` : '…'}</span>
      </div>
      <p className={s.taxNote}>{t('checkout.taxLine')}</p>
    </aside>
  )
}

/* ── Étape 1 : Adresse de livraison ── */
function StepAddress({ onNext, prefill, savedAddresses, t }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(buildAddressSchema(t)),
    defaultValues: {
      first_name: '',
      last_name:  '',
      street:     '',
      zip:        '',
      city:       '',
      canton:     '',
      phone:      '',
    },
  })

  /* Préremplissage dès que les données du compte sont disponibles */
  useEffect(() => {
    if (!prefill) return
    reset({
      first_name: prefill.firstName ?? '',
      last_name:  prefill.lastName  ?? '',
      street:     prefill.street    ?? '',
      zip:        prefill.zip       ?? '',
      city:       prefill.city      ?? '',
      canton:     prefill.canton    ?? '',
      phone:      prefill.phone     ?? '',
    })
  }, [prefill, reset])

  /* Sélection d'une adresse sauvegardée → prérempli le formulaire */
  const fillFromSaved = (addr) => {
    reset({
      first_name: prefill?.firstName ?? '',
      last_name:  prefill?.lastName  ?? '',
      street:     addr.street ?? '',
      zip:        addr.zip    ?? '',
      city:       addr.city   ?? '',
      canton:     addr.canton ?? '',
      phone:      addr.phone  ?? '',
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
                <span className={s.savedAddrLine}>{addr.street}, {addr.zip} {addr.city}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onNext)} noValidate className={s.form}>

        <div className={s.row}>
          <div className={s.field}>
            <label htmlFor="co-first" className={s.label}>{t('checkout.firstName')}</label>
            <input id="co-first" type="text" autoComplete="given-name"
              className={`${s.input} ${errors.first_name ? s.error : ''}`}
              {...register('first_name')} />
            {errors.first_name && (
              <span className={s.fieldError}><AlertCircle size={12} />{errors.first_name.message}</span>
            )}
          </div>
          <div className={s.field}>
            <label htmlFor="co-last" className={s.label}>{t('checkout.lastName')}</label>
            <input id="co-last" type="text" autoComplete="family-name"
              className={`${s.input} ${errors.last_name ? s.error : ''}`}
              {...register('last_name')} />
            {errors.last_name && (
              <span className={s.fieldError}><AlertCircle size={12} />{errors.last_name.message}</span>
            )}
          </div>
        </div>

        <div className={s.field}>
          <label htmlFor="co-street" className={s.label}>{t('checkout.street')}</label>
          <input id="co-street" type="text" autoComplete="street-address"
            placeholder={t('checkout.streetPlaceholder')}
            className={`${s.input} ${errors.street ? s.error : ''}`}
            {...register('street')} />
          {errors.street && (
            <span className={s.fieldError}><AlertCircle size={12} />{errors.street.message}</span>
          )}
        </div>

        <div className={s.rowThree}>
          <div className={s.field}>
            <label htmlFor="co-zip" className={s.label}>{t('checkout.zip')}</label>
            <input id="co-zip" type="text" autoComplete="postal-code" maxLength={4}
              placeholder={t('checkout.zipPlaceholder')}
              className={`${s.input} ${errors.zip ? s.error : ''}`}
              {...register('zip')} />
            {errors.zip && (
              <span className={s.fieldError}><AlertCircle size={12} />{errors.zip.message}</span>
            )}
          </div>
          <div className={s.field}>
            <label htmlFor="co-city" className={s.label}>{t('checkout.city')}</label>
            <input id="co-city" type="text" autoComplete="address-level2"
              placeholder={t('checkout.cityPlaceholder')}
              className={`${s.input} ${errors.city ? s.error : ''}`}
              {...register('city')} />
            {errors.city && (
              <span className={s.fieldError}><AlertCircle size={12} />{errors.city.message}</span>
            )}
          </div>
          <div className={s.field}>
            <label htmlFor="co-canton" className={s.label}>{t('checkout.canton')}</label>
            <input id="co-canton" type="text" maxLength={2}
              placeholder={t('checkout.cantonPlaceholder')}
              className={s.input}
              {...register('canton')} />
          </div>
        </div>

        {/* Pays — fixe Suisse, marché CH uniquement */}
        <div className={s.field}>
          <label className={s.label}>{t('checkout.country')}</label>
          <input type="text" readOnly value={t('checkout.countrySwitzerland')}
            className={`${s.input} ${s.inputReadonly}`} />
        </div>

        <div className={s.field}>
          <label htmlFor="co-phone" className={s.label}>{t('checkout.phone')}</label>
          <input id="co-phone" type="tel" autoComplete="tel"
            placeholder={t('checkout.phonePlaceholder')}
            className={s.input}
            {...register('phone')} />
        </div>

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
function StepSummary({ address, onBack, onSubmit, isSubmitting, globalError, subtotal, onCouponApplied, discount, couponCode, t }) {
  const [payment,     setPayment]     = useState('card')
  const [cgv,         setCgv]         = useState(false)
  const [cgvError,    setCgvError]    = useState('')
  const [couponInput, setCouponInput] = useState('')
  const [couponError, setCouponError] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)

  const PAYMENT_OPTIONS = [
    { value: 'card',  label: t('checkout.paymentCard'),  badge: '💳' },
    { value: 'twint', label: t('checkout.paymentTwint'), badge: '📱' },
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
      const msg = err.response?.data?.message ?? err.message ?? 'Code invalide.'
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

  const handleConfirm = () => {
    if (!cgv) { setCgvError(t('checkout.errors.cgvRequired')); return }
    setCgvError('')
    onSubmit({ payment_method: payment })
  }

  return (
    <div className={s.panel}>
      <h2 className={s.panelTitle}>{t('checkout.paymentMethod')}</h2>

      {globalError && (
        <div className={s.globalError} role="alert">
          <AlertCircle size={16} />{globalError}
        </div>
      )}

      {/* Récap adresse */}
      <div className={s.addressRecap}>
        <p className={s.addressRecapLabel}>Livraison à :</p>
        <p className={s.addressRecapValue}>
          {address.first_name} {address.last_name} — {address.street}, {address.zip} {address.city}
          {address.canton ? ` (${address.canton})` : ''}, Suisse
        </p>
      </div>

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
              onChange={() => setPayment(opt.value)}
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

      {/* Code promo */}
      <div className={s.couponSection}>
        <h3 className={s.couponTitle}><Tag size={14} /> Code promo ou bon de fidélité</h3>
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
              placeholder="Ex : BIENVENUE10"
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
              {couponLoading ? '…' : 'Appliquer'}
            </button>
          </div>
        )}
        {couponError && (
          <span className={s.fieldError}><AlertCircle size={12} />{couponError}</span>
        )}
      </div>

      {/* CGV */}
      <div className={`${s.cgvRow} ${s.cgvRowSpaced}`}>
        <input
          id="checkout-cgv"
          type="checkbox"
          className={s.checkbox}
          checked={cgv}
          onChange={e => { setCgv(e.target.checked); if (e.target.checked) setCgvError('') }}
        />
        <label htmlFor="checkout-cgv" className={s.cgvLabel}>
          {t('checkout.cgvAccept')}{' '}
          <Link to="/cgv">{t('checkout.cgvLink')}</Link>
        </label>
      </div>
      {cgvError && (
        <span className={`${s.fieldError} ${s.fieldErrorSpaced}`}>
          <AlertCircle size={12} />{cgvError}
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
          disabled={isSubmitting}
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
function TwintForm({ orderId, onPaid }) {
  const stripe   = useStripe()
  const elements = useElements()
  const [error,      setError]      = useState('')
  const [processing, setProcessing] = useState(false)

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
        setError(stripeErr.message ?? 'Paiement Twint refusé.')
      } else {
        onPaid()
      }
    } catch {
      setError('Erreur lors de la confirmation Twint.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {error && (
        <div className={s.twintError} role="alert">
          <AlertCircle size={16} />{error}
        </div>
      )}
      <button
        type="submit"
        className={`${s.btnPrimary} ${s.btnFullWidth}`}
        disabled={!stripe || processing}
      >
        {processing
          ? 'Traitement en cours…'
          : <><Lock size={15} />Confirmer le paiement Twint</>
        }
      </button>
    </form>
  )
}

/* ── Étape Twint : affichage du QR code via Stripe.js ── */
function StepTwint({ orderId, total, onPaid, t }) {
  const [clientSecret, setClientSecret] = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')

  const fetchIntent = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await createTwintIntent(orderId)
      setClientSecret(res.clientSecret)
    } catch {
      setError('Impossible de générer le paiement Twint. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchIntent() }, [orderId])

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
      <h2 className={s.twintTitle}>Payer par Twint</h2>
      <p className={s.twintDesc}>
        Scannez le QR code avec votre application <strong>Twint</strong> pour régler
        <strong> CHF {roundCHF(total).toFixed(2)}</strong>.
      </p>

      {loading && (
        <div className={s.twintLoading}>
          <div className={s.twintSpinner} />
          <p>Génération du paiement…</p>
        </div>
      )}

      {!loading && error && (
        <div className={s.twintError}>
          <AlertCircle size={16} />{error}
          <button onClick={fetchIntent} className={s.twintRetryBtn}>
            <RefreshCw size={14} /> Réessayer
          </button>
        </div>
      )}

      {!loading && !error && clientSecret && (
        <Elements
          stripe={stripePromise}
          options={{ clientSecret, appearance: stripeAppearance, locale: 'fr' }}
        >
          <TwintForm orderId={orderId} onPaid={onPaid} />
        </Elements>
      )}

      {!loading && (
        <button
          type="button"
          className={s.twintRefreshBtn}
          onClick={fetchIntent}
          disabled={loading}
        >
          <RefreshCw size={14} /> Recharger le QR
        </button>
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setError('')
    setProcessing(true)
    try {
      const { error: stripeErr } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/commande`,
        },
        redirect: 'if_required',
      })
      if (stripeErr) {
        setError(stripeErr.message ?? 'Paiement refusé.')
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
      <PaymentElement />
      {error && (
        <div className={s.cardError} role="alert">
          <AlertCircle size={14} />{error}
        </div>
      )}
      <button
        type="submit"
        className={`${s.btnPrimary} ${s.btnFullWidth}`}
        disabled={!stripe || processing}
      >
        {processing
          ? 'Traitement en cours…'
          : <><Lock size={15} />Payer CHF {roundCHF(total).toFixed(2)}</>
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

  useEffect(() => {
    createCardIntent(orderId)
      .then(res => setClientSecret(res.clientSecret))
      .catch(() => setError('Impossible d\'initialiser le paiement. Veuillez réessayer.'))
      .finally(() => setLoading(false))
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
          <p>Initialisation du paiement…</p>
        </div>
      )}

      {!loading && error && (
        <div className={s.cardError} role="alert">
          <AlertCircle size={14} />{error}
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
        <Lock size={12} /> Paiement sécurisé par Stripe · Visa, Mastercard acceptés
      </p>
    </div>
  )
}

/* ── Étape 3 : Confirmation ── */
function StepConfirm({ orderId, t }) {
  return (
    <div className={s.confirmWrap}>
      <div className={s.confirmIcon}><Check size={36} /></div>
      <h1 className={s.confirmTitle}>{t('checkout.confirmTitle')}</h1>
      <p className={s.confirmSubtitle}>{t('checkout.confirmSubtitle')}</p>
      {orderId && (
        <p className={s.confirmRef}>
          {t('checkout.confirmOrderRef')} :{' '}
          <Link to={`/commandes/${orderId}`} className={s.confirmOrderLink}>
            #{orderId}
          </Link>
        </p>
      )}
      <p className={s.confirmDesc}>{t('checkout.confirmDesc')}</p>
      <div className={s.confirmDelivery}>
        <Truck size={16} /><span>{t('checkout.deliveryInfo')}</span>
      </div>
      <Link
        to="/catalogue"
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
  const { items, subtotal, totalWeightKg, clearCart } = useCart()
  const { user, isAuthenticated }                    = useAuth()

  /* Restauration depuis sessionStorage après refresh à l'étape paiement */
  const [step,           setStep]           = useState(() => {
    const saved = sessionStorage.getItem('checkout_step')
    return saved === 'twint' || saved === 'card' ? saved : 1
  })
  const [address,        setAddress]        = useState(null)
  const [orderId,        setOrderId]        = useState(() => {
    return sessionStorage.getItem('checkout_order_id') || null
  })
  const [paymentMethod,  setPaymentMethod]  = useState('twint')
  const [orderTotal,     setOrderTotal]     = useState(() => {
    return parseFloat(sessionStorage.getItem('checkout_order_total') || '0')
  })
  const [isSubmitting,   setIsSubmitting]   = useState(false)
  const [globalError,    setGlobalError]    = useState('')
  const [prefill,        setPrefill]        = useState(null)
  const [savedAddresses, setSavedAddresses] = useState([])
  const [discount,        setDiscount]       = useState(0)
  const [couponCode,      setCouponCode]     = useState('')
  /* Frais de port — chargés dynamiquement depuis l'API à l'étape 2 */
  const [shipping,        setShipping]        = useState(null)
  const [shippingLoading, setShippingLoading] = useState(false)
  /* Sous-total brut avant remise — figé lors de la création de commande */
  const [subtotalSnapshot, setSubtotalSnapshot] = useState(0)
  /* Snapshot des articles avant vidage du panier */
  const [itemsSnapshot,  setItemsSnapshot]  = useState([])

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

  /* Redirection si panier vide (sauf après commande ou pendant la soumission) */
  useEffect(() => {
    const isPaymentStep = step === 'twint' || step === 'card'
    if (items.length === 0 && step < 3 && !isPaymentStep && !isSubmitting) {
      navigate('/panier', { replace: true })
    }
  }, [items.length, step, isSubmitting, navigate])

  /* Chargement des frais de port depuis l'API à l'entrée de l'étape 2 */
  useEffect(() => {
    if (step !== 2) return
    let cancelled = false
    setShippingLoading(true)
    getShippingRate(totalWeightKg)
      .then(data => { if (!cancelled) setShipping(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setShippingLoading(false) })
    return () => { cancelled = true }
  }, [step, totalWeightKg])

  const handleAddressNext = (data) => {
    setAddress(data)
    setStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePlaceOrder = async ({ payment_method }) => {
    setGlobalError('')
    setIsSubmitting(true)
    try {
      const res = await createOrder({
        address,
        payment_method,
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
      setPaymentMethod(payment_method)
      setOrderTotal(newTotal)
      setSubtotalSnapshot(subtotal)
      setItemsSnapshot([...items])

      if (payment_method === 'twint' || payment_method === 'card') {
        /* Persistance pour survie au refresh */
        sessionStorage.setItem('checkout_step',        payment_method)
        sessionStorage.setItem('checkout_order_id',    String(newOrderId))
        sessionStorage.setItem('checkout_order_total', String(newTotal))
      }

      /* Transition vers l'étape de paiement AVANT clearCart() pour éviter
         la redirection vers /panier (items.length=0 + step=2 déclencherait le guard) */
      if (payment_method === 'twint') {
        setStep('twint')
      } else if (payment_method === 'card') {
        setStep('card')
      } else {
        sessionStorage.removeItem('checkout_step')
        sessionStorage.removeItem('checkout_order_id')
        sessionStorage.removeItem('checkout_order_total')
        setStep(3)
      }

      clearCart()
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

      {step !== 3 && step !== 'twint' && step !== 'card' && <h1 className={s.heading}>{t('checkout.title')}</h1>}

      {/* Stepper — toujours visible, bloqué à l'étape 2 pendant le paiement */}
      {step !== 3 && (
        <Stepper step={typeof step === 'number' ? step : 2} t={t} />
      )}

      {step === 3 && (
        <StepConfirm orderId={orderId} t={t} />
      )}

      {(step === 'twint' || step === 'card') && (
        <div className={s.layout}>
          <div>
            {step === 'twint' && (
              <StepTwint
                orderId={orderId}
                total={orderTotal}
                onPaid={() => {
                  sessionStorage.removeItem('checkout_step')
                  sessionStorage.removeItem('checkout_order_id')
                  sessionStorage.removeItem('checkout_order_total')
                  setStep(3)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                t={t}
              />
            )}
            {step === 'card' && (
              <StepCard
                orderId={orderId}
                total={orderTotal}
                onPaid={() => {
                  sessionStorage.removeItem('checkout_step')
                  sessionStorage.removeItem('checkout_order_id')
                  sessionStorage.removeItem('checkout_order_total')
                  setStep(3)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                t={t}
              />
            )}
          </div>
          <OrderSummary items={itemsSnapshot} subtotal={subtotalSnapshot} discount={discount} couponCode={couponCode} shipping={shipping} shippingLoading={false} t={t} />
        </div>
      )}

      {(step === 1 || step === 2) && (
        <div className={s.layout}>

          {step === 1 && (
            <StepAddress onNext={handleAddressNext} prefill={prefill} savedAddresses={savedAddresses} t={t} />
          )}

          {step === 2 && (
            <StepSummary
              address={address}
              onBack={() => { setStep(1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              onSubmit={handlePlaceOrder}
              isSubmitting={isSubmitting}
              globalError={globalError}
              subtotal={subtotal}
              discount={discount}
              couponCode={couponCode}
              onCouponApplied={({ discount: d, code: c }) => { setDiscount(d); setCouponCode(c) }}
              t={t}
            />
          )}

          <OrderSummary items={items} subtotal={subtotal} discount={discount} couponCode={couponCode} shipping={shipping} shippingLoading={shippingLoading} t={t} />
        </div>
      )}
    </div>
  )
}
