import { useEffect, useState, useCallback } from 'react'
import { Check, Trash2, Star, AlertTriangle } from 'lucide-react'
import api from '../../services/api.js'
import s from './Reviews.module.css'

const FILTERS = [
  { value: 'pending',  label: 'En attente' },
  { value: 'approved', label: 'Approuvés'  },
  { value: 'all',      label: 'Tous'       },
]

function Stars({ rating }) {
  return (
    <span className={s.stars}>
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={13} fill={i <= rating ? '#f59e0b' : 'none'} stroke={i <= rating ? '#f59e0b' : '#d1d5db'} />
      ))}
    </span>
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('fr-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

export default function Reviews() {
  const [reviews,  setReviews]  = useState([])
  const [total,    setTotal]    = useState(0)
  const [filter,   setFilter]   = useState('pending')
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(false)
  /* compteurs par onglet pour les badges */
  const [counts,      setCounts]      = useState({ pending: 0, approved: 0, all: 0 })
  const [actionCount, setActionCount] = useState(0)
  const [actionError, setActionError] = useState(null)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: 50 })
      if (filter === 'approved') params.set('approved', 'true')
      if (filter === 'pending')  params.set('approved', 'false')
      const res = await api.get(`/admin/reviews?${params}`)
      setReviews(res.data.data ?? [])
      setTotal(res.data.pagination?.total ?? 0)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [filter])

  /* Compteurs indépendants du filtre actif — chargés une fois */
  useEffect(() => {
    Promise.all([
      api.get('/admin/reviews?limit=1&approved=false'),
      api.get('/admin/reviews?limit=1&approved=true'),
      api.get('/admin/reviews?limit=1'),
    ]).then(([pen, app, all]) => {
      setCounts({
        pending:  pen.data.pagination?.total ?? 0,
        approved: app.data.pagination?.total ?? 0,
        all:      all.data.pagination?.total ?? 0,
      })
    }).catch(() => {})
  }, [actionCount])

  useEffect(() => { load() }, [load])

  const handleApprove = async (id) => {
    setActionError(null)
    try {
      await api.put(`/admin/reviews/${id}/approve`)
      setReviews(prev => prev.map(r => r.id === id ? { ...r, is_approved: 1 } : r))
      setActionCount(c => c + 1)
    } catch {
      setActionError('Erreur lors de l\'approbation.')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cet avis définitivement ?')) return
    setActionError(null)
    try {
      await api.delete(`/admin/reviews/${id}`)
      setReviews(prev => prev.filter(r => r.id !== id))
      setTotal(t => t - 1)
      setActionCount(c => c + 1)
    } catch {
      setActionError('Erreur lors de la suppression.')
    }
  }

  return (
    <div className={s.page}>
      <div className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Avis clients</h1>
          <p className={s.pageSub}>{total} avis dans cet onglet</p>
        </div>
      </div>

      <div className={s.tabs}>
        {FILTERS.map(f => (
          <button
            key={f.value}
            className={`${s.tab} ${filter === f.value ? s.tabActive : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
            {counts[f.value] > 0 && (
              <span className={`${s.tabCount} ${f.value === 'pending' ? s.tabCountAlert : ''}`}>
                {counts[f.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {actionError && (
        <div className={s.errorBanner}>
          <AlertTriangle size={14} />
          {actionError}
        </div>
      )}

      {error && (
        <div className={s.errorBanner}>
          <AlertTriangle size={14} />
          Erreur de chargement. <button className={s.retryBtn} onClick={load}>Réessayer</button>
        </div>
      )}

      <div className={s.list}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className={s.skeleton} />)
        ) : reviews.length === 0 ? (
          <p className={s.empty}>Aucun avis dans cette catégorie.</p>
        ) : (
          reviews.map(review => (
            <div key={review.id} className={`${s.reviewCard} ${!review.is_approved ? s.reviewPending : ''}`}>
              <div className={s.reviewTop}>
                <div className={s.reviewMeta}>
                  <Stars rating={review.rating} />
                  <span className={s.reviewDate}>{formatDate(review.created_at)}</span>
                  {review.is_approved
                    ? <span className={s.approvedBadge}>Approuvé</span>
                    : <span className={s.pendingBadge}>En attente</span>
                  }
                </div>
                <div className={s.reviewActions}>
                  {!review.is_approved && (
                    <button className={s.approveBtn} onClick={() => handleApprove(review.id)}>
                      <Check size={14} /> Approuver
                    </button>
                  )}
                  <button className={s.deleteBtn} onClick={() => handleDelete(review.id)} aria-label="Supprimer">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <p className={s.reviewProduct}>{review.product_name}</p>
              <p className={s.reviewAuthor}>
                Par {review.first_name} {review.last_name}
                <span className={s.reviewEmail}> · {review.email}</span>
              </p>
              {review.title && <p className={s.reviewTitle}>"{review.title}"</p>}
              <p className={s.reviewBody}>{review.body}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
