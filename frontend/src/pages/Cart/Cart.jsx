import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Minus, Plus, Trash2, ShoppingBag, Lock, RotateCcw } from 'lucide-react'
import { useCart } from '../../contexts/CartContext.jsx'
import { roundCHF } from '../../utils/chf.js'
import { SHIPPING_CHF } from '../../utils/shipping.js'
import EmptyState from '../../components/ui/EmptyState/EmptyState.jsx'
import s from './Cart.module.css'

export default function Cart() {
  const { t }                                   = useTranslation()
  const { items, itemCount, subtotal, updateQty, removeItem } = useCart()

  const total = roundCHF(subtotal + SHIPPING_CHF)

  return (
    <div className={s.page}>

      {/* ── Fil d'Ariane ── */}
      <nav className={s.breadcrumb} aria-label="Fil d'Ariane">
        <Link to="/">{t('nav.home')}</Link>
        <ChevronRight size={13} aria-hidden="true" />
        <span aria-current="page">{t('cart.title')}</span>
      </nav>

      <h1 className={s.heading}>{t('cart.title')}</h1>

      {items.length > 0 && (
        <p className={s.itemCount}>
          {itemCount} {t('cart.item', { count: itemCount })}
        </p>
      )}

      {items.length === 0 ? (
        <div className={s.emptyWrap}>
          <EmptyState
            icon="🧵"
            title={t('cart.empty')}
            desc={t('cart.emptyDesc')}
            ctaLabel={t('cart.continueShopping')}
            ctaTo="/catalogue"
          />
        </div>
      ) : (
        <div className={s.layout}>

          {/* ── Liste des articles ── */}
          <ul className={s.items} role="list">
            {items.map(item => (
              <li key={item.id} className={s.item}>

                {/* Image */}
                <Link to={`/produit/${item.product_slug ?? item.product_id}`} tabIndex={-1} aria-hidden="true">
                  {item.product_image ? (
                    <img
                      src={item.product_image}
                      alt={item.product_name}
                      className={s.itemImage}
                      loading="lazy"
                      width={100}
                      height={100}
                    />
                  ) : (
                    <div
                      className={s.itemFallback}
                      style={{ background: item.product_bg ?? 'var(--rose-pale)' }}
                      aria-hidden="true"
                    >
                      {item.product_icon ?? '🧵'}
                    </div>
                  )}
                </Link>

                {/* Infos */}
                <div className={s.itemInfo}>
                  <Link to={`/produit/${item.product_slug ?? item.product_id}`} className={s.itemName}>
                    {item.product_name}
                  </Link>
                  {item.variant_value && (
                    <span className={s.itemVariant}>{item.variant_value}</span>
                  )}
                  <span className={s.itemPrice}>
                    CHF {item.unit_price?.toFixed(2)}
                  </span>
                </div>

                {/* Actions */}
                <div className={s.itemActions}>

                  {/* Total ligne */}
                  <span className={s.itemTotal}>
                    CHF {roundCHF(item.unit_price * item.quantity).toFixed(2)}
                  </span>

                  {/* Stepper quantité */}
                  <div className={s.qtyRow} role="group" aria-label="Quantité">
                    <button
                      className={s.qtyBtn}
                      onClick={() => updateQty(item.id, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      aria-label="Diminuer la quantité"
                    >
                      <Minus size={14} />
                    </button>
                    <span className={s.qtyValue} aria-live="polite">{item.quantity}</span>
                    <button
                      className={s.qtyBtn}
                      onClick={() => updateQty(item.id, item.quantity + 1)}
                      disabled={item.stock != null && item.quantity >= item.stock}
                      aria-label="Augmenter la quantité"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {/* Supprimer */}
                  <button
                    className={s.removeBtn}
                    onClick={() => removeItem(item.id)}
                    aria-label={`Supprimer ${item.product_name}`}
                  >
                    <Trash2 size={13} />
                    {t('cart.remove')}
                  </button>

                </div>
              </li>
            ))}
          </ul>

          {/* ── Récapitulatif ── */}
          <aside className={s.summary} aria-label={t('cart.summary')}>
            <h2 className={s.summaryTitle}>{t('cart.summary')}</h2>

            <div className={s.summaryRow}>
              <span>{t('cart.subtotal')}</span>
              <span>CHF {subtotal.toFixed(2)}</span>
            </div>

            <div className={s.summaryRow}>
              <span>{t('cart.shipping')}</span>
              <span>{t('cart.shippingValue')}</span>
            </div>

            <hr className={s.summaryDivider} />

            <div className={s.summaryTotal}>
              <span>{t('cart.total')}</span>
              <span>CHF {total.toFixed(2)}</span>
            </div>

            <p className={s.taxNote}>{t('cart.tax')}</p>

            <Link to="/commande" className={s.checkoutBtn}>
              <Lock size={15} />
              {t('cart.checkout')}
            </Link>

            <div className={s.summaryReassurance}>
              <div className={s.reassuranceItem}>
                <Lock size={14} />
                <span>{t('cart.securePayment')}</span>
              </div>
              <div className={s.reassuranceItem}>
                <RotateCcw size={14} />
                <span>{t('cart.freeReturn')}</span>
              </div>
            </div>
          </aside>

        </div>
      )}
    </div>
  )
}
