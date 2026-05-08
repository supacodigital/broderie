import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Star, Send, CheckCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '../../services/api.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import s from './ReviewsSection.module.css'

function Stars({ rating, size = 14 }) {
  return (
    <div className={s.stars} aria-label={`${rating} étoiles sur 5`}>
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={size} fill={i <= rating ? 'currentColor' : 'none'} />
      ))}
    </div>
  )
}

function RatingBar({ rating, count, total }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className={s.ratingBar}>
      <span className={s.ratingBarLabel}>{rating} ★</span>
      <div className={s.ratingBarTrack}>
        <div className={s.ratingBarFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={s.ratingBarCount}>{count}</span>
    </div>
  )
}

/* ── Formulaire de soumission d'avis ── */
function ReviewForm({ productId, onSubmitted }) {
  const { t } = useTranslation()
  const [hovered,     setHovered]     = useState(0)
  const [rating,      setRating]      = useState(0)
  const [title,       setTitle]       = useState('')
  const [body,        setBody]        = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [success,     setSuccess]     = useState(false)
  const [error,       setError]       = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (rating === 0) { setError(t('review.errorRating', 'Veuillez sélectionner une note.')); return }
    if (!body.trim()) { setError(t('review.errorBody', 'Veuillez écrire un commentaire.')); return }
    setError('')
    setSubmitting(true)
    try {
      await api.post(`/products/${productId}/reviews`, { rating, title: title.trim() || undefined, body: body.trim() })
      setSuccess(true)
      onSubmitted?.()
    } catch (err) {
      const msg = err.response?.data?.message
      setError(msg ?? t('review.errorGeneric', 'Une erreur est survenue. Veuillez réessayer.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className={s.formSuccess}>
        <CheckCircle size={22} className={s.formSuccessIcon} />
        <div>
          <p className={s.formSuccessTitle}>{t('review.successTitle', 'Merci pour votre avis !')}</p>
          <p className={s.formSuccessSub}>{t('review.successSub', 'Il sera publié après validation par notre équipe.')}</p>
        </div>
      </div>
    )
  }

  return (
    <form className={s.form} onSubmit={handleSubmit} noValidate>
      <h3 className={s.formTitle}>{t('review.formTitle', 'Laisser un avis')}</h3>

      {/* Sélecteur d'étoiles */}
      <div className={s.formField}>
        <label className={s.formLabel}>{t('review.labelRating', 'Votre note *')}</label>
        <div className={s.starPicker} role="group" aria-label="Note">
          {[1,2,3,4,5].map(i => (
            <button
              key={i}
              type="button"
              className={s.starBtn}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => setRating(i)}
              aria-label={`${i} étoile${i > 1 ? 's' : ''}`}
            >
              <Star
                size={26}
                fill={(hovered || rating) >= i ? 'currentColor' : 'none'}
                className={(hovered || rating) >= i ? s.starActive : s.starEmpty}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Titre */}
      <div className={s.formField}>
        <label className={s.formLabel}>{t('review.labelTitle', 'Titre (optionnel)')}</label>
        <input
          type="text"
          className={s.formInput}
          maxLength={120}
          placeholder={t('review.titlePlaceholder', 'Résumez votre expérience en quelques mots')}
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
      </div>

      {/* Commentaire */}
      <div className={s.formField}>
        <label className={s.formLabel}>{t('review.labelBody', 'Votre commentaire *')}</label>
        <textarea
          className={s.formTextarea}
          rows={4}
          maxLength={1000}
          placeholder={t('review.bodyPlaceholder', 'Partagez votre avis sur ce produit…')}
          value={body}
          onChange={e => setBody(e.target.value)}
          required
        />
        <span className={s.charCount}>{body.length} / 1000</span>
      </div>

      {error && <p className={s.formError}>{error}</p>}

      <button type="submit" className={s.formBtn} disabled={submitting}>
        {submitting
          ? t('review.submitting', 'Envoi en cours…')
          : <><Send size={14} /> {t('review.submit', 'Publier mon avis')}</>
        }
      </button>
    </form>
  )
}

export default function ReviewsSection({ productId, avgRating = 0, reviewCount = 0 }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  /* Normalise les valeurs MySQL qui arrivent en string */
  const avg   = parseFloat(avgRating) || 0
  const total = parseInt(reviewCount) || 0

  const [reviews,     setReviews]     = useState([])
  const [loading,     setLoading]     = useState(!!productId)
  const [dist,        setDist]        = useState({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 })
  const [submitted,   setSubmitted]   = useState(false)

  useEffect(() => {
    if (!productId) return
    let cancelled = false
    api.get(`/products/${productId}/reviews`, { params: { limit: 20 } })
      .then(({ data }) => {
        if (cancelled) return
        const rows = data.data ?? []
        const d = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
        rows.forEach(r => { if (r.rating >= 1 && r.rating <= 5) d[r.rating]++ })
        setReviews(rows)
        setDist(d)
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [productId])

  return (
    <section className={s.section} id="avis" aria-label="Avis clients">
      <div className={s.header}>
        <p className={s.eyebrow}>{t('testimonials.eyebrow')}</p>
        <h2 className={s.title}>{t('product.reviewsTitle')}</h2>
      </div>

      <div className={s.layout}>
        {/* ── Résumé note globale ── */}
        <div className={s.summary}>
          <div className={s.avgScore}>{avg.toFixed(1)}</div>
          <Stars rating={Math.round(avg)} size={18} />
          <p className={s.avgLabel}>{total} {t('product.reviews')}</p>
          <div className={s.distBars}>
            {[5,4,3,2,1].map(r => (
              <RatingBar key={r} rating={r} count={dist[r]} total={total} />
            ))}
          </div>
        </div>

        {/* ── Liste des avis ── */}
        <div className={s.listWrap}>
          <div className={s.list}>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={`${s.card} ${s.skeleton}`} aria-hidden="true" />
              ))
            ) : reviews.length === 0 ? (
              <p className={s.noReview}>{t('product.noReviews')}</p>
            ) : (
              reviews.map(r => (
                <article key={r.id} className={s.card}>
                  <div className={s.cardHeader}>
                    <Stars rating={r.rating} />
                    <time className={s.date} dateTime={r.created_at}>
                      {new Date(r.created_at).toLocaleDateString('fr-CH', {
                        year: 'numeric', month: 'long', day: 'numeric',
                      })}
                    </time>
                  </div>
                  {r.title && <p className={s.cardTitle}>{r.title}</p>}
                  <p className={s.cardBody}>{r.body}</p>
                  <footer className={s.cardFooter}>
                    <span className={s.reviewer}>
                      {r.first_name} {r.last_name?.[0] ? `${r.last_name[0]}.` : ''}
                    </span>
                  </footer>
                </article>
              ))
            )}
          </div>

          {/* ── Formulaire d'avis ── */}
          <div className={s.formWrap}>
            {!user ? (
              <div className={s.loginPrompt}>
                <p className={s.loginPromptText}>
                  {t('review.loginPrompt', 'Connectez-vous pour laisser un avis')}
                </p>
                <Link to="/connexion" className={s.loginPromptLink}>
                  {t('auth.login', 'Se connecter')}
                </Link>
              </div>
            ) : submitted ? null : (
              <ReviewForm
                productId={productId}
                onSubmitted={() => setSubmitted(true)}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
