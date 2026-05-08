import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { getProducts } from '../../services/products.service.js'
import ProductCard from '../../components/ui/ProductCard/ProductCard.jsx'
import { ProductCardSkeleton } from '../../components/ui/Skeleton/Skeleton.jsx'
import s from './RelatedProducts.module.css'

export default function RelatedProducts({ categoryId, currentProductId, locale = 'fr' }) {
  const { t } = useTranslation()
  const [products, setProducts] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!categoryId) { setLoading(false); return }
    let cancelled = false
    getProducts({ category_id: categoryId, locale, limit: 4, is_active: 1 })
      .then(d => {
        if (cancelled) return
        const filtered = (d.data ?? []).filter(p => p.id !== currentProductId).slice(0, 4)
        setProducts(filtered)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [categoryId, currentProductId, locale])

  if (!loading && products.length === 0) return null

  return (
    <section className={s.section} aria-label="Produits similaires">
      <div className={s.header}>
        <p className={s.eyebrow}>{t('product.relatedEyebrow')}</p>
        <h2 className={s.title}>{t('product.relatedTitle')}</h2>
      </div>

      <div className={s.grid}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
          : products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)
        }
      </div>

      <div className={s.cta}>
        <Link to="/catalogue" className={s.btn}>{t('products.viewAll')}</Link>
      </div>
    </section>
  )
}
