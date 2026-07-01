import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Heart, ShoppingBag, Star, Truck, Shield, ChevronDown, ChevronUp, Gift } from 'lucide-react'
import { Link } from 'react-router-dom'
import { roundCHF } from '../../utils/chf.js'
import s from './ProductInfo.module.css'

/* Calcule la TVA à afficher selon le taux snapshot */
function formatTVA(priceChf, taxRate) {
  if (!taxRate) return null
  const ttc  = roundCHF(priceChf)
  const ht   = roundCHF(ttc / (1 + taxRate / 100))
  const tva  = roundCHF(ttc - ht)
  return { ttc, ht, tva, rate: taxRate }
}

function Stars({ rating, count }) {
  const r = parseFloat(rating) || 0
  return (
    <div className={s.starsRow}>
      <div className={s.stars} aria-label={`${r} étoiles sur 5`}>
        {[1,2,3,4,5].map(i => (
          <Star key={i} size={14} fill={i <= Math.round(r) ? 'currentColor' : 'none'} />
        ))}
      </div>
      <span className={s.starsCount}>{r.toFixed(1)} ({count} avis)</span>
    </div>
  )
}

export default function ProductInfo({ product, onAddToCart, wishlisted, onWishlist }) {
  const { t } = useTranslation()

  const [selectedVariant, setSelectedVariant] = useState(null)
  const [qty,             setQty]             = useState(1)
  const [detailsOpen,     setDetailsOpen]     = useState(false)
  const [addedFeedback,   setAddedFeedback]   = useState(false)

  const variants    = product.variants ?? []
  const hasVariants = variants.length > 0

  /* Groupe les variantes par leur attribut "name" (ex: "Couleur", "Taille") */
  const variantGroups = hasVariants
    ? variants.reduce((acc, v) => {
        if (!acc[v.name]) acc[v.name] = []
        acc[v.name].push(v)
        return acc
      }, {})
    : {}

  const effectivePrice = selectedVariant
    ? roundCHF(product.price_chf + (selectedVariant.price_modifier ?? 0))
    : roundCHF(product.price_chf)

  /* Produit sur commande : fabriqué à la demande, commande possible sans stock (délai 3 à 4 semaines) */
  const isMadeToOrder = !!product.is_made_to_order
  const rawStockQty = selectedVariant ? selectedVariant.stock : (product.stock ?? 99)
  /* Pour un produit sur commande, on ne limite pas la quantité par le stock */
  const stockQty = isMadeToOrder ? 999 : rawStockQty
  const outOfStock = !isMadeToOrder && rawStockQty === 0

  const tva = formatTVA(effectivePrice, product.tax_rate ?? 8.1)

  function handleAdd() {
    if (outOfStock) return
    onAddToCart?.({ product, variant: selectedVariant, qty })
    setAddedFeedback(true)
    setTimeout(() => setAddedFeedback(false), 2000)
  }

  return (
    <div className={s.info}>
      {/* ── Fil d'Ariane catégorie ── */}
      {product.category_name && (
        <p className={s.category}>{product.category_name}</p>
      )}

      {/* ── Nom ── */}
      <h1 className={s.title}>{product.name}</h1>

      {/* ── Notes ── */}
      {product.avg_rating != null && (
        <Stars rating={product.avg_rating} count={product.review_count ?? 0} />
      )}

      {/* ── Prix ── */}
      <div className={s.priceBlock}>
        <span className={s.price}>CHF {effectivePrice.toFixed(2)}</span>
        {product.compare_price_chf && (
          <span className={s.priceOld}>CHF {roundCHF(product.compare_price_chf).toFixed(2)}</span>
        )}
        {product.compare_price_chf && (
          <span className={s.discount}>
            -{Math.round((1 - product.price_chf / product.compare_price_chf) * 100)}%
          </span>
        )}
      </div>

      {/* ── Détail TVA — obligatoire légalement ── */}
      {tva && (
        <p className={s.tvaLine}>
          Prix TTC · TVA {tva.rate}% incluse (CHF {tva.tva.toFixed(2)})
        </p>
      )}

      {/* ── Programme de fidélité ── */}
      <Link to="/mon-compte?tab=loyalty" className={s.loyaltyHint}>
        <Gift size={14} className={s.loyaltyIcon} aria-hidden="true" />
        <span>
          Cet achat vous rapporte{' '}
          <strong>CHF {effectivePrice.toFixed(2)}</strong>{' '}
          dans votre programme de fidélité
        </span>
      </Link>

      {/* ── Variantes ── */}
      {hasVariants && Object.entries(variantGroups).map(([groupName, opts]) => (
        <div key={groupName} className={s.variantGroup}>
          <p className={s.variantLabel}>
            {groupName}
            {selectedVariant?.name === groupName && (
              <span className={s.variantSelected}> — {selectedVariant.value}</span>
            )}
          </p>
          <div className={s.variantOptions}>
            {opts.map(v => (
              <button
                key={v.id}
                className={`${s.variantBtn} ${selectedVariant?.id === v.id ? s.variantBtnActive : ''} ${v.stock === 0 ? s.variantBtnOut : ''}`}
                onClick={() => setSelectedVariant(v.id === selectedVariant?.id ? null : v)}
                disabled={v.stock === 0}
                aria-pressed={selectedVariant?.id === v.id}
                title={v.stock === 0 ? 'Épuisé' : v.value}
              >
                {v.value}
                {parseFloat(v.price_modifier) > 0 && <span className={s.variantMod}>+{parseFloat(v.price_modifier).toFixed(2)}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* ── Stock ── */}
      {/* Produit sur commande : on masque le stock et on affiche le badge de délai à la place */}
      {isMadeToOrder ? (
        <p className={s.madeToOrder}>{t('products.madeToOrder')}</p>
      ) : (
        <>
          {stockQty <= 5 && stockQty > 0 && (
            <p className={s.stockWarning}>⚠ Plus que {stockQty} en stock</p>
          )}
          {outOfStock && (
            <p className={s.outOfStock}>Épuisé — revenez bientôt</p>
          )}
        </>
      )}

      {/* ── Quantité + Panier ── */}
      <div className={s.addRow}>
        <div className={s.qtyWrap}>
          <button
            className={s.qtyBtn}
            onClick={() => setQty(q => Math.max(1, q - 1))}
            aria-label="Diminuer la quantité"
            disabled={qty <= 1}
          >−</button>
          <span className={s.qtyValue} aria-live="polite">{qty}</span>
          <button
            className={s.qtyBtn}
            onClick={() => setQty(q => Math.min(stockQty, q + 1))}
            aria-label="Augmenter la quantité"
            disabled={qty >= stockQty || outOfStock}
          >+</button>
        </div>

        <button
          className={`${s.addBtn} ${addedFeedback ? s.addBtnSuccess : ''}`}
          onClick={handleAdd}
          disabled={outOfStock || (hasVariants && !selectedVariant)}
          aria-label={outOfStock ? 'Épuisé' : t('products.addToCart')}
        >
          <ShoppingBag size={16} aria-hidden="true" />
          {addedFeedback
            ? '✓ Ajouté !'
            : outOfStock
              ? 'Épuisé'
              : t('products.addToCart')}
        </button>

        <button
          className={`${s.wishlistBtn} ${wishlisted ? s.wishlistBtnActive : ''}`}
          onClick={() => onWishlist?.(product.id)}
          aria-label={wishlisted ? t('products.removeWishlist', { name: product.name }) : t('products.addWishlist', { name: product.name })}
        >
          <Heart size={18} fill={wishlisted ? '#DB2777' : 'none'} />
        </button>
      </div>

      {/* ── Réassurance ── */}
      <div className={s.reassurance}>
        <div className={s.reassuranceItem}>
          <Truck size={14} aria-hidden="true" />
          <span>{t('advantages.shipping.title')} — {t('advantages.shipping.desc')}</span>
        </div>
        <div className={s.reassuranceItem}>
          <Shield size={14} aria-hidden="true" />
          <span>{t('advantages.payment.title')} — {t('advantages.payment.desc')}</span>
        </div>
      </div>

      {/* ── Description + détails accordéon ── */}
      {product.description && (
        <div className={s.descBlock}>
          <p className={s.desc}>{product.description}</p>
        </div>
      )}

      {product.details && (
        <div className={s.accordion}>
          <button
            className={s.accordionBtn}
            onClick={() => setDetailsOpen(o => !o)}
            aria-expanded={detailsOpen}
          >
            <span>{t('product.details')}</span>
            {detailsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {detailsOpen && (
            <div className={s.accordionContent}>
              <p>{product.details}</p>
            </div>
          )}
        </div>
      )}

      {/* ── SKU ── */}
      {product.sku && (
        <p className={s.sku}>Réf. {product.sku}</p>
      )}
    </div>
  )
}
