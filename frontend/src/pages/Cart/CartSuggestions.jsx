import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getProducts } from '../../services/products.service.js'
import ProductCard from '../../components/ui/ProductCard/ProductCard.jsx'
import { ProductCardSkeleton } from '../../components/ui/Skeleton/Skeleton.jsx'
import s from './CartSuggestions.module.css'

export default function CartSuggestions({ items, locale = 'fr' }) {
  const { t } = useTranslation()
  const [products, setProducts] = useState([])
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    if (!items || items.length === 0) { setProducts([]); return }

    const lastItem      = items[items.length - 1]
    const categorySlug  = lastItem.category_slug
    if (!categorySlug) { setProducts([]); return }

    const cartProductIds = new Set(items.map(i => i.product_id))
    let cancelled = false
    setLoading(true)

    getProducts({ category: categorySlug, locale, limit: 6, in_stock: 'true' })
      .then(d => {
        if (cancelled) return
        const filtered = (d.data ?? [])
          .filter(p => !cartProductIds.has(p.id))
          .slice(0, 4)
        setProducts(filtered)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [items, locale])

  if (!loading && products.length === 0) return null

  return (
    <section className={s.section} aria-label="Suggestions">
      <div className={s.header}>
        <p className={s.eyebrow}>{t('cart.suggestionsEyebrow', 'Vous aimerez aussi')}</p>
        <h2 className={s.title}>{t('cart.suggestionsTitle', 'Complétez votre commande')}</h2>
      </div>

      <div className={s.grid}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
          : products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)
        }
      </div>
    </section>
  )
}
