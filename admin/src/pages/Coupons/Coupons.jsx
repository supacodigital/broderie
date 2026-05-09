import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Edit2, Trash2, Copy, Check, AlertTriangle, X, Search, Shuffle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getCoupons, createCoupon, updateCoupon, deleteCoupon } from '../../services/coupons.service.js'
import ConfirmDialog from '../../components/ui/ConfirmDialog/ConfirmDialog.jsx'
import s from './Coupons.module.css'

const schema = z.object({
  code:        z.string().min(1, 'Code requis'),
  type:        z.enum(['fixed', 'percent']),
  value:       z.coerce.number().positive('Valeur invalide'),
  minOrderChf: z.coerce.number().min(0, 'Montant invalide').optional(),
  usageLimit:  z.union([z.coerce.number().int().positive('Limite invalide'), z.literal('')]).optional().nullable(),
  expiresAt:   z.string().optional().nullable(),
  isActive:    z.boolean().optional(),
})

/* Génère un code aléatoire */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

/* ── Modale création / édition ── */
function CouponModal({ coupon, onClose, onSaved }) {
  const isEdit = !!coupon
  const [apiError, setApiError] = useState('')
  const [saved,    setSaved]    = useState(false)

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: coupon ? {
      code:        coupon.code,
      type:        coupon.type,
      value:       parseFloat(coupon.value),
      minOrderChf: parseFloat(coupon.min_order_chf) || 0,
      usageLimit:  coupon.usage_limit ?? '',
      expiresAt:   coupon.expires_at ? coupon.expires_at.slice(0, 10) : '',
      isActive:    coupon.is_active !== false && coupon.is_active !== 0,
    } : { type: 'percent', minOrderChf: 0, isActive: true, expiresAt: '', usageLimit: '' },
  })

  const type = watch('type')

  const onSubmit = async (data) => {
    setApiError('')
    const payload = {
      code:        data.code.toUpperCase(),
      type:        data.type,
      value:       Number(data.value),
      minOrderChf: Number(data.minOrderChf ?? 0),
      usageLimit:  data.usageLimit !== '' && data.usageLimit != null ? Number(data.usageLimit) : null,
      expiresAt:   data.expiresAt ? new Date(data.expiresAt).toISOString() : null,
      isActive:    !!data.isActive,
    }
    try {
      if (isEdit) {
        await updateCoupon(coupon.id, payload)
      } else {
        await createCoupon(payload)
      }
      setSaved(true)
      setTimeout(() => { onSaved(); onClose() }, 500)
    } catch (err) {
      setApiError(err.response?.data?.message ?? 'Une erreur est survenue.')
    }
  }

  return (
    <div
      className={s.overlay}
      onClick={onClose}
      onKeyDown={e => e.key === 'Escape' && onClose()}
      tabIndex={-1}
    >
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.modalHead}>
          <h2 className={s.modalTitle}>{isEdit ? `Modifier — ${coupon.code}` : 'Nouveau coupon'}</h2>
          <button className={s.closeBtn} onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className={s.modalBody}>
          {apiError && (
            <div className={s.apiError}><AlertTriangle size={13} /> {apiError}</div>
          )}

          <div className={s.formGrid}>
            <div className={s.fieldFull}>
              <label className={s.label}>Code promotionnel *</label>
              <div className={s.codeInputWrap}>
                <input
                  className={`${s.input} ${s.inputCode} ${errors.code ? s.inputError : ''}`}
                  {...register('code')}
                  placeholder="ex: PROMO20"
                  style={{ textTransform: 'uppercase' }}
                />
                {!isEdit && (
                  <button
                    type="button"
                    className={s.generateBtn}
                    onClick={() => setValue('code', generateCode())}
                    title="Générer un code aléatoire"
                  >
                    <Shuffle size={14} /> Générer
                  </button>
                )}
              </div>
              {errors.code && <span className={s.err}>{errors.code.message}</span>}
            </div>

            <div className={s.field}>
              <label className={s.label}>Type de remise *</label>
              <select className={s.input} {...register('type')}>
                <option value="percent">Pourcentage (%)</option>
                <option value="fixed">Montant fixe (CHF)</option>
              </select>
            </div>

            <div className={s.field}>
              <label className={s.label}>
                {type === 'percent' ? 'Remise (%)' : 'Remise (CHF)'} *
              </label>
              <input
                type="number"
                step={type === 'percent' ? '1' : '0.05'}
                min="0"
                className={`${s.input} ${errors.value ? s.inputError : ''}`}
                {...register('value')}
              />
              {errors.value && <span className={s.err}>{errors.value.message}</span>}
            </div>

            <div className={s.field}>
              <label className={s.label}>Commande minimum (CHF)</label>
              <input type="number" step="0.05" min="0" className={s.input} {...register('minOrderChf')} />
            </div>

            <div className={s.field}>
              <label className={s.label}>Limite d'utilisation</label>
              <input type="number" min="1" placeholder="Illimitée" className={s.input} {...register('usageLimit')} />
            </div>

            <div className={s.field}>
              <label className={s.label}>Date d'expiration</label>
              <input type="date" className={s.input} {...register('expiresAt')} />
            </div>
          </div>

          <label className={s.checkRow}>
            <input type="checkbox" {...register('isActive')} />
            <span>Coupon actif</span>
          </label>

          <div className={s.modalActions}>
            <button type="button" className={s.btnCancel} onClick={onClose}>Annuler</button>
            <button type="submit" className={s.btnSave} disabled={isSubmitting || saved}>
              {saved
                ? <><Check size={14} /> Enregistré</>
                : isSubmitting ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Bouton copie code ── */
function CopyCode({ code }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button className={s.copyBtn} onClick={handleCopy} aria-label="Copier le code">
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('fr-CH', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(iso))
}

function isExpired(expires_at) {
  if (!expires_at) return false
  return new Date(expires_at) < new Date()
}

function getStatus(coupon) {
  if (!coupon.is_active) return 'inactive'
  if (isExpired(coupon.expires_at)) return 'expired'
  if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) return 'full'
  return 'active'
}

const STATUS_FILTERS = [
  { value: 'all',      label: 'Tous'     },
  { value: 'active',   label: 'Actifs'   },
  { value: 'expired',  label: 'Expirés'  },
  { value: 'full',     label: 'Épuisés'  },
  { value: 'inactive', label: 'Inactifs' },
]

const STATUS_LABELS = {
  active:   'Actif',
  inactive: 'Inactif',
  expired:  'Expiré',
  full:     'Épuisé',
}

/* ── Page principale ── */
export default function Coupons() {
  const [coupons,   setCoupons]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(false)
  const [delError,  setDelError]  = useState(null)
  const [modal,     setModal]     = useState(null)
  const [confirm,   setConfirm]   = useState(null)
  const [search,    setSearch]    = useState('')
  const [filter,    setFilter]    = useState('all')
  const debounceRef = useRef(null)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await getCoupons({ limit: 100 })
      setCoupons(res.data ?? [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = (id) => {
    setConfirm({
      message: 'Supprimer ce coupon ?',
      onConfirm: async () => {
        setDelError(null)
        try {
          await deleteCoupon(id)
          setCoupons(prev => prev.filter(c => c.id !== id))
        } catch (err) {
          setDelError(err.response?.data?.message ?? 'Erreur lors de la suppression.')
        }
      },
    })
  }

  /* Filtre local : statut + recherche par code */
  const filtered = coupons.filter(c => {
    const matchFilter = filter === 'all' || getStatus(c) === filter
    const matchSearch = !search || c.code.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  /* Compteurs par statut pour les badges */
  const counts = coupons.reduce((acc, c) => {
    const st = getStatus(c)
    acc[st] = (acc[st] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className={s.page}>
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
      {modal && (
        <CouponModal
          coupon={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}

      <div className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Codes promo</h1>
          <p className={s.pageSub}>{coupons.length} coupon{coupons.length > 1 ? 's' : ''}</p>
        </div>
        <button className={s.btnPrimary} onClick={() => setModal('new')}>
          <Plus size={16} /> Nouveau coupon
        </button>
      </div>

      {/* Toolbar : filtres + recherche */}
      <div className={s.toolbar}>
        <div className={s.filterRow}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              className={`${s.filterBtn} ${filter === f.value ? s.filterBtnActive : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
              {f.value !== 'all' && counts[f.value] > 0 && (
                <span className={s.filterCount}>{counts[f.value]}</span>
              )}
            </button>
          ))}
        </div>
        <div className={s.searchWrap}>
          <Search size={14} className={s.searchIcon} />
          <input
            type="search"
            className={s.searchInput}
            placeholder="Rechercher un code…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {(error || delError) && (
        <div className={s.errorBanner}>
          <AlertTriangle size={14} />
          {delError ?? 'Erreur de chargement.'}
          {!delError && <button className={s.retryBtn} onClick={load}>Réessayer</button>}
        </div>
      )}

      <div className={s.card}>
        <div className={s.tableHead}>
          <span>Code</span>
          <span>Remise</span>
          <span>Min. commande</span>
          <span>Utilisations</span>
          <span>Expiration</span>
          <span>Statut</span>
          <span></span>
        </div>

        {loading ? (
          <div className={s.skeletonWrap}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={s.skeleton} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className={s.empty}>
            {search || filter !== 'all' ? 'Aucun coupon trouvé.' : 'Aucun coupon créé.'}
          </p>
        ) : (
          filtered.map(coupon => {
            const status = getStatus(coupon)
            return (
              <div key={coupon.id} className={s.tableRow}>
                <div className={s.codeCell}>
                  <span className={s.codeText}>{coupon.code}</span>
                  <CopyCode code={coupon.code} />
                </div>
                <span className={s.discount}>
                  {coupon.type === 'percent'
                    ? `−${parseFloat(coupon.value)}%`
                    : `−CHF ${parseFloat(coupon.value).toFixed(2)}`
                  }
                </span>
                <span className={s.muted}>
                  {parseFloat(coupon.min_order_chf) > 0
                    ? `CHF ${parseFloat(coupon.min_order_chf).toFixed(2)}`
                    : '—'
                  }
                </span>
                <span className={s.usage}>
                  {coupon.used_count}
                  {coupon.usage_limit !== null && (
                    <span className={s.usageLimit}>/{coupon.usage_limit}</span>
                  )}
                </span>
                <span className={status === 'expired' ? s.expiredDate : s.muted}>
                  {formatDate(coupon.expires_at)}
                </span>
                <span className={s.statusBadge} data-status={status}>
                  {STATUS_LABELS[status]}
                </span>
                <div className={s.actions}>
                  <button className={s.iconBtn} onClick={() => setModal(coupon)} aria-label="Modifier">
                    <Edit2 size={14} />
                  </button>
                  <button className={s.iconBtnDanger} onClick={() => handleDelete(coupon.id)} aria-label="Supprimer">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
