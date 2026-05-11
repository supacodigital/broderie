import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Star, MapPin } from 'lucide-react'
import { getLatestReviews } from '../../../services/reviews.service.js'
import s from './TestimonialsSection.module.css'

function Stars({ rating }) {
  return (
    <div className={s.stars} role="img" aria-label={`${rating} étoiles sur 5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={14} fill={i <= rating ? 'currentColor' : 'none'} aria-hidden="true" />
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
    getLatestReviews({ limit: 3, rating: 5 })
      .then((data) => { if (!cancelled) setReviews(data.data ?? []) })
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

      {/* Lien vers les avis Google */}
      <div className={s.googleCta}>
        <a
          href="https://www.google.com/search?newwindow=1&sca_esv=ff9f10b283514a9d&sxsrf=ANbL-n4mjtUL7TuYDB4OSvGpGUkfMHFhtA:1778519759739&q=au+point+compte&si=AL3DRZHrmvnFAVQPOO2Bzhf8AX9KZZ6raUI_dT7DG_z0kV2_x-5xhXilZAOrphM0YE-AsPZNBIsfUBsxLegsu_9mQQmdRvN7Ut-JoOMS15A_f8fIyiuGOfg%3D&uds=ALYpb_n_EM_B_ErB9c5NX69H4GoWKshDLc8uQBW1mpQQEtPpjNay5hVoOHoGiTKgb7PHfp9Lq-cRnubVTicj-mqUjKnx1xx0d4N-oZtGLgh3cAwOolcnGRk&sa=X&ved=2ahUKEwjO9YS03rGUAxVRnycCHScoNIMQ3PALegQIKxAF&biw=1470&bih=773&dpr=2"
          target="_blank"
          rel="noopener noreferrer"
          className={s.googleBtn}
          aria-label={t('testimonials.googleAriaLabel')}
        >
          {/* Logo Google SVG */}
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"/>
          </svg>
          {t('testimonials.googleCta')}
        </a>
      </div>
    </section>
  )
}
