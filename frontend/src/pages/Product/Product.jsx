import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import { getProductBySlug } from '../../services/products.service.js'
import { normalizeLocale } from '../../utils/locale.js'
import { useCart } from '../../contexts/CartContext.jsx'
import { useWishlist } from '../../contexts/WishlistContext.jsx'
import ImageGallery   from './ImageGallery.jsx'
import ProductInfo    from './ProductInfo.jsx'
import ReviewsSection from './ReviewsSection.jsx'
import RelatedProducts from './RelatedProducts.jsx'
import { ProductCardSkeleton } from '../../components/ui/Skeleton/Skeleton.jsx'
import EmptyState from '../../components/ui/EmptyState/EmptyState.jsx'
import s from './Product.module.css'

export default function Product() {
  const { slug }         = useParams()
  const { t, i18n }      = useTranslation()
  const navigate         = useNavigate()

  const [product,   setProduct]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [notFound,  setNotFound]  = useState(false)
  const [error,     setError]     = useState(false)
  const { ids: wishlistIds, toggle: toggleWishlist } = useWishlist()
  const abortRef = useRef(null)

  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    setNotFound(false)
    setError(false)
    let cancelled = false
    getProductBySlug(slug, normalizeLocale(i18n.language))
      .then(d => { if (!cancelled) setProduct(d.data) })
      .catch(err => {
        if (cancelled) return
        if (err.response?.status === 404) setNotFound(true)
        else setError(true)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true; abortRef.current?.abort() }
  }, [slug, i18n.language])

  const { addItem } = useCart()

  const handleAddToCart = useCallback(({ product: p, variant, qty }) => {
    addItem({ product: p, variant, qty })
  }, [addItem])

  const handleWishlist = useCallback((id) => toggleWishlist(id), [toggleWishlist])

  /* ── États ── */
  if (loading) {
    return (
      <div className={s.page}>
        <div className={s.skeletonLayout}>
          <div className={s.skeletonGallery}>
            <ProductCardSkeleton />
          </div>
          <div className={s.skeletonInfo}>
            {[80, 50, 40, 60, 35, 100].map((w, i) => (
              <div key={i} className={s.skeletonLine} style={{ width: `${w}%`, height: i === 0 ? 32 : 16, marginBottom: 12 }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className={s.page}>
        <EmptyState
          icon="🔍"
          title="Produit introuvable"
          desc="Ce produit n'existe pas ou a été retiré du catalogue."
          ctaLabel="Retour au catalogue"
          ctaTo="/catalogue"
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className={s.page}>
        <EmptyState
          icon="⚠️"
          title="Erreur de chargement"
          desc="Une erreur est survenue. Veuillez réessayer."
          ctaLabel="Retour au catalogue"
          ctaTo="/catalogue"
        />
      </div>
    )
  }

  return (
    <div className={s.page}>
      {/* ── Fil d'Ariane ── */}
      <nav className={s.breadcrumb} aria-label="Fil d'Ariane">
        <Link to="/">{t('nav.home')}</Link>
        <ChevronRight size={13} aria-hidden="true" />
        <Link to="/catalogue">{t('catalogue.allProducts')}</Link>
        {product.category_name && (
          <>
            <ChevronRight size={13} aria-hidden="true" />
            <Link to={`/catalogue/${product.category_slug ?? ''}`}>{product.category_name}</Link>
          </>
        )}
        <ChevronRight size={13} aria-hidden="true" />
        <span aria-current="page">{product.name}</span>
      </nav>

      {/* ── Layout principal : galerie + infos ── */}
      <div className={s.layout}>
        <div className={s.galleryCol}>
          <ImageGallery
            images={product.images ?? []}
            productName={product.name}
            fallbackIcon={product.icon}
            badge={product.badge ?? null}
            priceChf={product.price_chf ?? null}
            comparePriceChf={product.compare_price_chf ?? null}
          />
        </div>

        <div className={s.infoCol}>
          <ProductInfo
            product={product}
            onAddToCart={handleAddToCart}
            wishlisted={product ? wishlistIds.has(product.id) : false}
            onWishlist={handleWishlist}
          />
        </div>
      </div>

      {/* ── Avis + Produits similaires ── */}
      <div className={s.bottom}>
        <ReviewsSection
          productId={product.id}
          avgRating={product.avg_rating ?? 0}
          reviewCount={product.review_count ?? 0}
        />
        <RelatedProducts
          categoryId={product.category_id}
          currentProductId={product.id}
          locale={normalizeLocale(i18n.language)}
        />
      </div>
    </div>
  )
}
