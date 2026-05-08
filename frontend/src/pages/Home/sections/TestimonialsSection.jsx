import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Star, MapPin } from 'lucide-react'
import api from '../../../services/api.js'
import s from './TestimonialsSection.module.css'

function Stars({ rating }) {
  return (
    <div className={s.stars} aria-label={`${rating} étoiles sur 5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={14} fill={i <= rating ? 'currentColor' : 'none'} />
      ))}
    </div>
  )
}

export default function TestimonialsSection() {
  const { t } = useTranslation()
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.get('/reviews', { params: { limit: 3, rating: 5 } })
      .then(({ data }) => { if (!cancelled) setReviews(data.data ?? []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (!loading && reviews.length === 0) return null

  return (
    <section className={s.section} id="temoignages">
      <div className={s.header}>
        <p className={s.eyebrow}>{t('testimonials.eyebrow')}</p>
        <h2 className={s.title}>{t('testimonials.title')}</h2>
        <p className={s.desc}>{t('testimonials.desc')}</p>
      </div>

      <div className={s.grid}>
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`${s.card} ${s.skeleton}`} aria-hidden="true" />
            ))
          : reviews.map(item => (
              <blockquote key={item.id} className={s.card}>
                <div className={s.quote} aria-hidden="true">"</div>
                <Stars rating={item.rating} />
                <p className={s.text}>{item.body}</p>
                <footer className={s.author}>
                  <div className={s.avatarInitial} aria-hidden="true">
                    {(item.first_name?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div>
                    <p className={s.name}>
                      {item.first_name} {item.last_name?.[0] ? `${item.last_name[0]}.` : ''}
                    </p>
                    {item.title && (
                      <p className={s.location}>
                        <MapPin size={10} aria-hidden="true" />
                        {item.title}
                      </p>
                    )}
                  </div>
                </footer>
              </blockquote>
            ))
        }
      </div>
    </section>
  )
}
