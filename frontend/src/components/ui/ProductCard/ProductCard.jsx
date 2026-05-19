import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Heart, Star } from 'lucide-react'
import { roundCHF } from '../../../utils/chf.js'
import { useCart } from '../../../contexts/CartContext.jsx'
import s from './ProductCard.module.css'

const BG_FALLBACKS = [
  'linear-gradient(135deg,#fce7f3,#f9a8d4)',
  'linear-gradient(135deg,#fdf2f8,#fbcfe8)',
  'linear-gradient(135deg,#f5f3ff,#ddd6fe)',
  'linear-gradient(135deg,#fff7ed,#fed7aa)',
  'linear-gradient(135deg,#f0fdf4,#bbf7d0)',
  'linear-gradient(135deg,#fefce8,#fde68a)',
  'linear-gradient(135deg,#ecfeff,#a5f3fc)',
]

function Stars({ rating }) {
  return (
    <div className={s.stars} role="img" aria-label={`${rating} étoiles sur 5`}>
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={11} fill={i <= rating ? 'currentColor' : 'none'} aria-hidden="true" />
      ))}
    </div>
  )
}

export default function ProductCard({ product, index = 0, wishlisted = false, onWishlist, onAddToCart, mode = 'grid', featured = false }) {
  const { t }      = useTranslation()
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)

  const handleWishlist = useCallback((e) => {
    e.preventDefault()
    onWishlist?.(product.id)
  }, [product.id, onWishlist])

  const handleAdd = useCallback((e) => {
    e.preventDefault()
    if (onAddToCart) {
      onAddToCart(product)
    } else {
      addItem({ product, qty: 1 })
    }
    /* Feedback visuel 2s */
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }, [product, onAddToCart, addItem])

  /* Supporte les deux formats : liste (image_url flat) et détail (images[]) */
  const primaryImage = product.images?.[0] ?? (product.image_url ? { url: product.image_url, alt: product.image_alt ?? product.name } : null)
  const bg = BG_FALLBACKS[index % BG_FALLBACKS.length]

  if (mode === 'list') {
    return (
      <article className={s.cardList} aria-label={product.name}>
        <div className={s.listImageWrap}>
          {primaryImage ? (
            <img
              src={primaryImage.url}
              alt={primaryImage.alt ?? product.name}
              className={s.listImage}
              loading="lazy"
              width="100"
              height="100"
            />
          ) : (
            <div className={s.listImageFallback} style={{ background: bg }} aria-hidden="true">🧵</div>
          )}
        </div>

        <div className={s.listBody}>
          <div className={s.listMain}>
            <p className={s.brand}>Au Point-Compté</p>
            <Link to={`/produit/${product.slug}`} className={s.listName}>{product.name}</Link>
            {product.description && (
              <p className={s.listDesc}>{product.description}</p>
            )}
            <div className={s.ratingRow}>
              <Stars rating={product.avg_rating ?? 0} />
              <span className={s.reviewCount}>({product.review_count ?? 0})</span>
            </div>
          </div>

          <div className={s.listActions}>
            <div>
              <p className={s.price}>
                CHF {roundCHF(product.price_chf).toFixed(2)}
                {product.compare_price_chf && (
                  <span className={s.priceOld}>CHF {roundCHF(product.compare_price_chf).toFixed(2)}</span>
                )}
              </p>
              {product.stock !== undefined && product.stock <= 5 && product.stock > 0 && (
                <p className={s.listStock}>Plus que {product.stock} en stock</p>
              )}
              {product.stock === 0 && (
                <p className={s.listStockOut}>Épuisé</p>
              )}
            </div>
            <div className={s.listBtns}>
              <button
                className={s.wishlistBtnList}
                onClick={handleWishlist}
                aria-label={wishlisted ? t('products.removeWishlist', { name: product.name }) : t('products.addWishlist', { name: product.name })}
              >
                <Heart size={15} fill={wishlisted ? '#DB2777' : 'none'} color={wishlisted ? '#DB2777' : 'currentColor'} />
              </button>
              <button
                className={s.addBtnList}
                onClick={handleAdd}
                disabled={product.stock === 0}
              >
                {product.stock === 0 ? 'Épuisé' : added ? '✓ Ajouté !' : t('products.addToCart')}
              </button>
            </div>
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className={featured ? s.cardFeatured : s.card} aria-label={product.name}>
      <div className={s.imageWrap}>
        <Link to={`/produit/${product.slug}`} className={s.imageLink} tabIndex={-1} aria-hidden="true">
          {primaryImage ? (
            <img
              src={primaryImage.url}
              alt={primaryImage.alt ?? product.name}
              className={s.image}
              loading="lazy"
              width="300"
              height="400"
            />
          ) : (
            <div className={s.imageFallback} style={{ background: bg }} aria-hidden="true">
              🧵
            </div>
          )}
        </Link>

        {(() => {
          const b = product.badge
          if (!b) return null
          const LABELS = {
            nouveaute:     'Nouveauté',
            promo:         product.compare_price_chf
              ? `-${Math.round((1 - product.price_chf / product.compare_price_chf) * 100)}%`
              : 'Promo',
            coup_de_coeur: 'Coup de ♡',
            exclusif:      'Exclusif',
          }
          return (
            <span className={`${s.badge} ${s[`badge_${b}`] ?? ''}`}>
              {LABELS[b] ?? b}
            </span>
          )
        })()}

        {product.stock !== undefined && product.stock <= 5 && product.stock > 0 && (
          <span className={s.stockWarning}>Plus que {product.stock} en stock</span>
        )}

        <button
          className={s.wishlistBtn}
          onClick={handleWishlist}
          aria-label={wishlisted
            ? t('products.removeWishlist', { name: product.name })
            : t('products.addWishlist',    { name: product.name })}
        >
          <Heart size={15} fill={wishlisted ? '#DB2777' : 'none'} color={wishlisted ? '#DB2777' : 'currentColor'} />
        </button>

        <button
          className={s.addBtn}
          onClick={handleAdd}
          disabled={product.stock === 0}
          aria-label={t('products.addToCart')}
        >
          {product.stock === 0 ? 'Épuisé' : added ? '✓ Ajouté !' : t('products.addToCart')}
        </button>
      </div>

      <Link to={`/produit/${product.slug}`} className={s.info}>
        <p className={s.brand}>Au Point-Compté</p>
        <p className={s.name}>{product.name}</p>
        <div className={s.footer}>
          <p className={s.price}>
            CHF {roundCHF(product.price_chf).toFixed(2)}
            {product.compare_price_chf && (
              <span className={s.priceOld}>CHF {roundCHF(product.compare_price_chf).toFixed(2)}</span>
            )}
          </p>
          <div className={s.ratingRow}>
            <Stars rating={product.avg_rating ?? 0} />
            <span className={s.reviewCount}>({product.review_count ?? 0})</span>
          </div>
        </div>
      </Link>
    </article>
  )
}
