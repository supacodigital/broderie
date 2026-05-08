import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Heart, Star } from 'lucide-react'
import api from '../../../services/api.js'
import { roundCHF } from '../../../utils/chf.js'
import { normalizeLocale } from '../../../utils/locale.js'
import s from './FeaturedProductsSection.module.css'

const INSPO_TAGS = [
  'Point de croix', 'Broderie libre', 'Smocks',
  'Hardanger', 'Ruban', 'Embroidery anglaise', 'Débutant', 'Expert',
]

function Stars({ rating }) {
  return (
    <div className={s.stars} aria-label={`${rating} étoiles sur 5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={12} fill={i <= rating ? 'currentColor' : 'none'} />
      ))}
    </div>
  )
}

export default function FeaturedProductsSection() {
  const { t, i18n } = useTranslation()
  const [products,   setProducts]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [wishlist,   setWishlist]   = useState(new Set())
  const [activeTag,  setActiveTag]  = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.get('/products', {
      params: { featured: true, locale: normalizeLocale(i18n.language), limit: 8 },
    })
      .then(({ data }) => { if (!cancelled) setProducts(data.data ?? []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [i18n.language])

  const toggleWishlist = useCallback((id) => {
    setWishlist(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  return (
    <>
      {/* ── Bandeau inspiration ── */}
      <div className={s.inspoBar}>
        <p className={s.inspoTitle} aria-hidden="true">S'inspirer</p>
        <div className={s.inspoTags} role="list">
          {INSPO_TAGS.map((tag, i) => (
            <button
              key={i}
              className={`${s.inspoTag} ${activeTag === i ? s.inspoTagActive : ''}`}
              onClick={() => setActiveTag(i)}
              aria-pressed={activeTag === i}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* ── Grille produits ── */}
      <section className={s.section} id="produits">
        <div className={s.header}>
          <p className={s.eyebrow}>{t('products.eyebrow')}</p>
          <h2 className={s.title}>{t('products.title')}</h2>
          <p className={s.desc}>{t('products.desc')}</p>
        </div>

        <div className={s.grid}>
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={`${s.card} ${s.skeleton}`} aria-hidden="true">
                  <div className={s.imageWrap} />
                </div>
              ))
            : products.map(p => (
            <article key={p.id} className={s.card} aria-label={p.name}>
              <div className={s.imageWrap}>
                {p.image_url || p.images?.[0] ? (
                  <img
                    src={p.images?.[0]?.url ?? p.image_url}
                    alt={p.images?.[0]?.alt ?? p.image_alt ?? p.name}
                    className={s.image}
                    loading="lazy"
                    width="300"
                    height="400"
                  />
                ) : (
                  <div
                    className={s.imageFallback}
                    style={{ background: 'var(--rose-pale)' }}
                    aria-hidden="true"
                  >
                    🧵
                  </div>
                )}

                {p.badge && <span className={s.badge}>{p.badge}</span>}

                <button
                  className={s.wishlistBtn}
                  onClick={() => toggleWishlist(p.id)}
                  aria-label={
                    wishlist.has(p.id)
                      ? t('products.removeWishlist', { name: p.name })
                      : t('products.addWishlist',    { name: p.name })
                  }
                >
                  <Heart
                    size={16}
                    fill={wishlist.has(p.id) ? '#DB2777' : 'none'}
                    color={wishlist.has(p.id) ? '#DB2777' : 'currentColor'}
                  />
                </button>

                <button
                  className={s.addBtn}
                  aria-label={t('products.addToCart')}
                >
                  {t('products.addToCart')}
                </button>
              </div>

              <Link to={`/produit/${p.slug}`} className={s.info}>
                <p className={s.brand}>Au Point-Compté</p>
                <p className={s.name}>{p.name}</p>
                <div className={s.footer}>
                  <p className={s.price}>
                    CHF {roundCHF(p.price_chf).toFixed(2)}
                    {p.compare_price_chf && (
                      <span className={s.priceOld}>
                        CHF {roundCHF(p.compare_price_chf).toFixed(2)}
                      </span>
                    )}
                  </p>
                  <div className={s.ratingWrap}>
                    <Stars rating={p.avg_rating ?? 5} />
                    <span className={s.reviewCount}>({p.review_count ?? 0})</span>
                  </div>
                </div>
              </Link>
            </article>
            ))
          }
        </div>

        <div className={s.viewAll}>
          <Link to="/catalogue" className={s.btnPrimary}>{t('products.viewAll')}</Link>
        </div>
      </section>
    </>
  )
}
