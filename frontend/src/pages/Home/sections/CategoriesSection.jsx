import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { getCategories } from '../../../services/products.service.js'
import { normalizeLocale } from '../../../utils/locale.js'
import s from './CategoriesSection.module.css'

/* Couleurs de fallback tant que les vraies images ne sont pas chargées */
const BG_FALLBACKS = [
  'linear-gradient(135deg, #fce7f3 0%, #f9a8d4 100%)',
  'linear-gradient(135deg, #fdf2f8 0%, #fbcfe8 100%)',
  'linear-gradient(135deg, #f5f3ff 0%, #ddd6fe 100%)',
  'linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)',
  'linear-gradient(135deg, #f0fdf4 0%, #bbf7d0 100%)',
  'linear-gradient(135deg, #fefce8 0%, #fde68a 100%)',
]
const ICONS = ['🧵', '🎀', '🪡', '⭕', '✂️', '📖']

export default function CategoriesSection() {
  const { t, i18n } = useTranslation()
  const [categories, setCategories] = useState([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getCategories(normalizeLocale(i18n.language))
      .then((data) => { if (!cancelled) setCategories(data.data ?? []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [i18n.language])

  return (
    <section className={s.section} id="categories">
      <div className={s.header}>
        <p className={s.eyebrow}>{t('categories.eyebrow')}</p>
        <h2 className={s.title}>{t('categories.title')}</h2>
        <p className={s.desc}>{t('categories.desc')}</p>
      </div>

      <div className={s.grid}>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`${s.card} ${s.skeleton}`} aria-hidden="true" />
            ))
          : categories.map((cat, i) => (
              <Link
                key={cat.id}
                to={`/catalogue/${cat.slug}`}
                className={s.card}
                aria-label={`Catégorie : ${cat.name}`}
              >
                {cat.image_url ? (
                  <img
                    src={cat.image_url}
                    alt=""
                    className={s.img}
                    loading="lazy"
                    width="400"
                    height="530"
                  />
                ) : (
                  <div
                    className={s.imgFallback}
                    style={{ background: BG_FALLBACKS[i % BG_FALLBACKS.length] }}
                    aria-hidden="true"
                  >
                    <span className={s.icon}>{ICONS[i % ICONS.length]}</span>
                  </div>
                )}
                <div className={s.overlay}>
                  <p className={s.catName}>{cat.name}</p>
                  <p className={s.catCount}>
                    {t('categories.articles', { count: cat.product_count ?? 0 })}
                  </p>
                </div>
              </Link>
            ))
        }
      </div>
    </section>
  )
}
