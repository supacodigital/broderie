import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { X, Minus, Plus, Trash2, ShoppingBag, Lock } from 'lucide-react'
import { useCart } from '../../../contexts/CartContext.jsx'
import { useCartDrawer } from '../../../contexts/CartDrawerContext.jsx'
import { roundCHF } from '../../../utils/chf.js'
import s from './CartDrawer.module.css'

export default function CartDrawer() {
  const { t } = useTranslation()
  const { isOpen, closeCartDrawer } = useCartDrawer()
  const { items, itemCount, subtotal, updateQty, removeItem } = useCart()
  const navigate = useNavigate()

  /* Bloque le scroll du body quand le drawer est ouvert */
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isOpen])

  /* Fermeture au clavier (Escape) */
  useEffect(() => {
    if (!isOpen) return
    function onKey(e) { if (e.key === 'Escape') closeCartDrawer() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, closeCartDrawer])

  /* Navigation depuis le drawer — ferme avant de naviguer */
  function goToPage(path) {
    closeCartDrawer()
    navigate(path)
  }

  return (
    <>
      {/* ── Overlay assombri ── */}
      <div
        className={`${s.overlay} ${isOpen ? s.overlayOpen : ''}`}
        onClick={closeCartDrawer}
        aria-hidden="true"
      />

      {/* ── Panneau latéral ── */}
      <aside
        className={`${s.drawer} ${isOpen ? s.drawerOpen : ''}`}
        aria-hidden={!isOpen}
        aria-modal="true"
        role="dialog"
        aria-label={t('cart.title')}
      >
        {/* En-tête */}
        <header className={s.header}>
          <div className={s.headerTitle}>
            <ShoppingBag size={18} aria-hidden="true" />
            <h2>{t('cart.title')}</h2>
            {itemCount > 0 && (
              <span className={s.headerCount}>
                {itemCount} {t('cart.item', { count: itemCount })}
              </span>
            )}
          </div>
          <button
            className={s.closeBtn}
            onClick={closeCartDrawer}
            aria-label="Fermer le panier"
          >
            <X size={20} />
          </button>
        </header>

        {/* Corps */}
        <div className={s.body}>
          {items.length === 0 ? (
            <div className={s.empty}>
              <div className={s.emptyIcon} aria-hidden="true">🧵</div>
              <p className={s.emptyTitle}>{t('cart.empty')}</p>
              <p className={s.emptyDesc}>{t('cart.emptyDesc')}</p>
              <button
                className={s.emptyCta}
                onClick={() => goToPage('/catalogue')}
              >
                {t('cart.continueShopping')}
              </button>
            </div>
          ) : (
            <ul className={s.items} role="list">
              {items.map((item) => (
                <li key={item.id} className={s.item}>
                  {/* Image / fallback */}
                  <Link
                    to={`/produit/${item.product_slug ?? item.product_id}`}
                    onClick={closeCartDrawer}
                    className={s.itemImageWrap}
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    {item.product_image ? (
                      <img
                        src={item.product_image}
                        alt={item.product_name}
                        className={s.itemImage}
                        loading="lazy"
                        width={72}
                        height={72}
                      />
                    ) : (
                      <div
                        className={s.itemFallback}
                        style={{ background: item.product_bg ?? 'var(--rose-pale)' }}
                      >
                        {item.product_icon ?? '🧵'}
                      </div>
                    )}
                  </Link>

                  {/* Infos + actions */}
                  <div className={s.itemContent}>
                    <div className={s.itemTop}>
                      <Link
                        to={`/produit/${item.product_slug ?? item.product_id}`}
                        onClick={closeCartDrawer}
                        className={s.itemName}
                      >
                        {item.product_name}
                      </Link>
                      <button
                        className={s.removeBtn}
                        onClick={() => removeItem(item.id)}
                        aria-label={`Supprimer ${item.product_name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {item.variant_value && (
                      <span className={s.itemVariant}>{item.variant_value}</span>
                    )}

                    <div className={s.itemBottom}>
                      <div className={s.qtyRow} role="group" aria-label="Quantité">
                        <button
                          className={s.qtyBtn}
                          onClick={() => updateQty(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          aria-label="Diminuer la quantité"
                        >
                          <Minus size={12} />
                        </button>
                        <span className={s.qtyValue} aria-live="polite">
                          {item.quantity}
                        </span>
                        <button
                          className={s.qtyBtn}
                          onClick={() => updateQty(item.id, item.quantity + 1)}
                          disabled={item.stock != null && item.quantity >= item.stock}
                          aria-label="Augmenter la quantité"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      <span className={s.itemTotal}>
                        CHF {roundCHF(item.unit_price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pied — affiché uniquement si le panier contient des articles */}
        {items.length > 0 && (
          <footer className={s.footer}>
            <div className={s.subtotalRow}>
              <span>{t('cart.subtotal')}</span>
              <span className={s.subtotalValue}>CHF {subtotal.toFixed(2)}</span>
            </div>
            <p className={s.shippingNote}>{t('cart.tax')}</p>

            <button
              className={s.checkoutBtn}
              onClick={() => goToPage('/commande')}
            >
              <Lock size={15} aria-hidden="true" />
              {t('cart.checkout')}
            </button>
            <button
              className={s.viewCartBtn}
              onClick={() => goToPage('/panier')}
            >
              {t('cart.viewCart')}
            </button>
          </footer>
        )}
      </aside>
    </>
  )
}
