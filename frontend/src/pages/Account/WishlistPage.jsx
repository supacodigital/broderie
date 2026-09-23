import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Heart, X } from 'lucide-react'
import { useWishlist } from '../../contexts/WishlistContext.jsx'
import { getWishlist } from '../../services/wishlist.service.js'
import { roundCHF } from '../../utils/chf.js'
import { normalizeLocale } from '../../utils/locale.js'
import s from './Account.module.css'

/* ── Onglet Wishlist ── */
export default function WishlistPage() {
  const { i18n } = useTranslation()
  const { toggle } = useWishlist()
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getWishlist(normalizeLocale(i18n.language))
      .then(d => { if (!cancelled) setItems(d.data ?? []) })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [i18n.language])

  const handleRemove = async (productId) => {
    setItems(prev => prev.filter(i => i.product_id !== productId))
    toggle(productId)
  }

  if (loading) {
    return (
      <section className={s.panel}>
        <h2 className={s.panelTitle}>Mes favoris</h2>
        <div className={s.skeletonList}>
          {[1,2,3].map(i => <div key={i} className={s.skeletonRow} />)}
        </div>
      </section>
    )
  }

  if (!items.length) {
    return (
      <section className={s.panel}>
        <h2 className={s.panelTitle}>Mes favoris</h2>
        <div className={s.emptyState}>
          <Heart size={40} className={s.emptyIcon} />
          <p className={s.emptyTitle}>Aucun favori</p>
          <p className={s.emptyDesc}>Ajoutez des produits à vos favoris depuis le catalogue.</p>
          <Link to="/catalogue" className={s.btnPrimary}>Découvrir le catalogue</Link>
        </div>
      </section>
    )
  }

  return (
    <section className={s.panel}>
      <h2 className={s.panelTitle}>Mes favoris <span className={s.countBadge}>{items.length}</span></h2>
      <div className={s.wishlistGrid}>
        {items.map(item => (
          <div key={item.id} className={s.wishlistCard}>
            <button
              className={s.wishlistRemove}
              onClick={() => handleRemove(item.product_id)}
              aria-label={`Retirer ${item.product_name} des favoris`}
            >
              <X size={14} />
            </button>
            <Link to={`/produit/${item.slug}`} className={s.wishlistImgWrap}>
              {item.image_url
                ? <img src={item.image_url} alt={item.product_name} className={s.wishlistImg} loading="lazy" />
                : <div className={s.wishlistImgFallback} aria-hidden="true">🧵</div>
              }
              {item.stock === 0 && <span className={s.outOfStockBadge}>Épuisé</span>}
            </Link>
            <div className={s.wishlistInfo}>
              <Link to={`/produit/${item.slug}`} className={s.wishlistName}>{item.product_name}</Link>
              <div className={s.wishlistPrices}>
                <span className={s.wishlistPrice}>CHF {roundCHF(parseFloat(item.price_chf)).toFixed(2)}</span>
                {item.compare_price_chf && (
                  <span className={s.wishlistOldPrice}>CHF {roundCHF(parseFloat(item.compare_price_chf)).toFixed(2)}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
