import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Plus, Edit2, Trash2, AlertTriangle, Check, X,
  Users, Gift, CheckCircle, Clock, Search,
} from 'lucide-react'
import { formatDate } from '../../utils/date.js'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import Pagination from '../../components/ui/Pagination/Pagination.jsx'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  getLoyaltyKpis,
  getLoyaltyTiers,
  createLoyaltyTier,
  updateLoyaltyTier,
  deleteLoyaltyTier,
  getLoyaltyAccounts,
  getLoyaltyRewards,
} from '../../services/loyalty.service.js'
import { roundCHF } from '../../utils/chf.js'
import ConfirmDialog from '../../components/ui/ConfirmDialog/ConfirmDialog.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import s from './Loyalty.module.css'

const schema = z.object({
  name:               z.string().min(1, 'Nom requis'),
  minSpendChf:        z.coerce.number().positive('Montant invalide'),
  rewardType:         z.enum(['fixed', 'percent']),
  rewardValue:        z.coerce.number().positive('Valeur invalide'),
  rewardValidityDays: z.coerce.number().int().positive('Durée invalide'),
  isActive:           z.boolean().optional(),
  sortOrder:          z.coerce.number().int().min(0).optional(),
})

/* ── Modale création/édition palier ── */
function TierModal({ tier, onClose, onSaved }) {
  const isEdit = !!tier
  const [apiError, setApiError] = useState('')
  const [saved,    setSaved]    = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: isEdit ? {
      name:               tier.name               ?? '',
      minSpendChf:        parseFloat(tier.min_spend_chf)      || 0,
      rewardType:         tier.reward_type         ?? 'fixed',
      rewardValue:        parseFloat(tier.reward_value)        || 0,
      rewardValidityDays: tier.reward_validity_days ?? 90,
      isActive:           tier.is_active !== false && tier.is_active !== 0,
      sortOrder:          tier.sort_order          ?? 1,
    } : { rewardType: 'fixed', isActive: true, sortOrder: 1, rewardValidityDays: 90 },
  })

  const onSubmit = async (data) => {
    setApiError('')
    try {
      if (isEdit) {
        await updateLoyaltyTier(tier.id, data)
      } else {
        await createLoyaltyTier(data)
      }
      setSaved(true)
      setTimeout(() => { onSaved(); onClose() }, 500)
    } catch (err) {
      setApiError(err.response?.data?.message ?? 'Une erreur est survenue.')
    }
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.modalHead}>
          <h2 className={s.modalTitle}>{isEdit ? 'Modifier le palier' : 'Nouveau palier'}</h2>
          <button className={s.closeBtn} onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className={s.modalBody}>
          {apiError && (
            <div className={s.apiError}><AlertTriangle size={13} /> {apiError}</div>
          )}
          <div className={s.formGrid}>
            <div className={s.field}>
              <label className={s.label}>Nom du palier *</label>
              <input className={`${s.input} ${errors.name ? s.inputError : ''}`} placeholder="Ex: Argent, Or…" {...register('name')} />
              {errors.name && <span className={s.err}>{errors.name.message}</span>}
            </div>
            <div className={s.field}>
              <label className={s.label}>Seuil cumulé (CHF) *</label>
              <input type="number" step="0.05" min="0" className={`${s.input} ${errors.minSpendChf ? s.inputError : ''}`} {...register('minSpendChf')} />
              {errors.minSpendChf && <span className={s.err}>{errors.minSpendChf.message}</span>}
            </div>
            <div className={s.field}>
              <label className={s.label}>Type de récompense *</label>
              <select className={s.input} {...register('rewardType')}>
                <option value="fixed">Montant fixe (CHF)</option>
                <option value="percent">Pourcentage (%)</option>
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label}>Valeur de la récompense *</label>
              <input type="number" step="0.01" min="0" className={`${s.input} ${errors.rewardValue ? s.inputError : ''}`} {...register('rewardValue')} />
              {errors.rewardValue && <span className={s.err}>{errors.rewardValue.message}</span>}
            </div>
            <div className={s.field}>
              <label className={s.label}>Validité du bon (jours) *</label>
              <input type="number" min="1" className={`${s.input} ${errors.rewardValidityDays ? s.inputError : ''}`} {...register('rewardValidityDays')} />
              {errors.rewardValidityDays && <span className={s.err}>{errors.rewardValidityDays.message}</span>}
            </div>
            <div className={s.field}>
              <label className={s.label}>Ordre d'affichage</label>
              <input type="number" min="0" className={s.input} {...register('sortOrder')} />
            </div>
          </div>
          <label className={s.checkRow}>
            <input type="checkbox" {...register('isActive')} />
            <span>Palier actif</span>
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

/* ── KPIs globaux ── */
function GlobalKpis() {
  const [kpis,    setKpis]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getLoyaltyKpis()
      .then(res => setKpis(res))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const items = kpis ? [
    { icon: <Users size={16} />,       label: 'Clients fidélisés',  value: kpis.totalAccounts,    color: '' },
    { icon: <Gift size={16} />,        label: 'Bons disponibles',   value: kpis.availableRewards, color: s.kpiGreen },
    { icon: <CheckCircle size={16} />, label: 'Bons utilisés',      value: kpis.usedRewards,      color: s.kpiBlue },
    { icon: <Clock size={16} />,       label: 'Bons expirés',       value: kpis.expiredRewards,   color: s.kpiGray },
  ] : []

  return (
    <div className={s.kpiRow}>
      {loading
        ? Array.from({ length: 4 }).map((_, i) => <div key={i} className={s.kpiSkeleton} />)
        : items.map(item => (
            <div key={item.label} className={`${s.kpi} ${item.color}`}>
              <div className={s.kpiIcon}>{item.icon}</div>
              <div>
                <p className={s.kpiVal}>{item.value ?? 0}</p>
                <p className={s.kpiLbl}>{item.label}</p>
              </div>
            </div>
          ))
      }
    </div>
  )
}

/* ── Onglet paliers ── */
function TiersTab() {
  const toast = useToast()
  const [tiers,   setTiers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [modal,   setModal]   = useState(null)
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await getLoyaltyTiers()
      setTiers(res ?? [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = (id) => {
    setConfirm({
      message: 'Supprimer ce palier ?',
      onConfirm: async () => {
        try {
          await deleteLoyaltyTier(id)
          setTiers(prev => prev.filter(t => t.id !== id))
          toast.success('Palier supprimé.')
        } catch (err) {
          toast.error(err.response?.data?.message ?? 'Erreur lors de la suppression.')
        }
      },
    })
  }

  return (
    <>
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
      <div className={s.tabToolbar}>
        <button className={s.btnPrimary} onClick={() => setModal('new')}>
          <Plus size={16} /> Nouveau palier
        </button>
      </div>

      {modal && (
        <TierModal
          tier={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}

      {error && <ErrorBanner onRetry={load} />}

      <div className={s.tierList}>
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className={s.skeleton} />)
        ) : tiers.length === 0 ? (
          <p className={s.empty}>Aucun palier configuré.</p>
        ) : (
          tiers.map((tier, idx) => {
            const metalColors = [
              { bg: '#cd7f32', text: '#fff', shadow: 'rgba(205,127,50,0.3)' },  // Bronze
              { bg: '#a8a9ad', text: '#fff', shadow: 'rgba(168,169,173,0.3)' }, // Argent
              { bg: '#d4af37', text: '#fff', shadow: 'rgba(212,175,55,0.3)' },  // Or
              { bg: '#b9f2ff', text: '#0d7390', shadow: 'rgba(185,242,255,0.3)' }, // Platine
            ]
            const metal = metalColors[idx] ?? metalColors[metalColors.length - 1]
            return (
            <div key={tier.id} className={s.tierCard}>
              <div className={s.tierLeft}>
                <div className={s.tierIcon} style={{ background: metal.bg, color: metal.text, boxShadow: `0 2px 8px ${metal.shadow}` }}>
                  {tier.sort_order ?? idx + 1}
                </div>
                <div>
                  <p className={s.tierName}>{tier.name}</p>
                  <p className={s.tierThreshold}>
                    dès CHF {roundCHF(parseFloat(tier.min_spend_chf)).toLocaleString('fr-CH', { minimumFractionDigits: 2 })} cumulés
                  </p>
                </div>
              </div>
              <div className={s.tierReward}>
                <p className={s.tierRewardValue}>
                  {tier.reward_type === 'fixed'
                    ? `CHF ${roundCHF(parseFloat(tier.reward_value)).toFixed(2)}`
                    : `${parseFloat(tier.reward_value)}% de remise`
                  }
                </p>
                <p className={s.tierValidity}>valable {tier.reward_validity_days} jours</p>
              </div>
              <span className={s.activeBadge} data-active={String(!!tier.is_active)}>
                {tier.is_active ? 'Actif' : 'Inactif'}
              </span>
              <div className={s.tierActions}>
                <button className={s.iconBtn} onClick={() => setModal(tier)} aria-label="Modifier">
                  <Edit2 size={14} />
                </button>
                <button className={s.iconBtnDanger} onClick={() => handleDelete(tier.id)} aria-label="Supprimer">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            )
          })
        )}
      </div>
    </>
  )
}

/* ── Onglet comptes clients ── */
function AccountsTab() {
  const [accounts,  setAccounts]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(false)
  const [page,      setPage]      = useState(1)
  const [total,     setTotal]     = useState(0)
  const [search,    setSearch]    = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef(null)
  const LIMIT = 20

  const handleSearch = (val) => {
    setSearch(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(val)
      setPage(1)
    }, 300)
  }

  const load = useCallback(async (p = 1) => {
    setError(false)
    setLoading(true)
    try {
      const params = { page: p, limit: LIMIT }
      if (debouncedSearch) params.q = debouncedSearch
      const res = await getLoyaltyAccounts(params)
      setAccounts(res.data ?? [])
      setTotal(res.pagination?.total ?? 0)
      setPage(p)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch])

  useEffect(() => { load(1) }, [load])

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <>
      <div className={s.accountToolbar}>
        <div className={s.searchWrap}>
          <Search size={14} className={s.searchIcon} />
          <input
            type="search"
            className={s.searchInput}
            placeholder="Rechercher un client…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
        <span className={s.accountTotal}>{total} compte{total !== 1 ? 's' : ''}</span>
      </div>

      {error && <ErrorBanner onRetry={() => load(page)} />}

      <div className={s.accountCard}>
        <div className={s.accountListHead}>
          <span>Client</span>
          <span>Palier</span>
          <span>CA cumulé</span>
          <span>Bons dispo.</span>
          <span>Mis à jour</span>
        </div>

        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={s.skeletonRow} />
          ))
        ) : accounts.length === 0 ? (
          <p className={s.empty}>Aucun compte fidélité trouvé.</p>
        ) : (
          accounts.map(acc => (
            <div key={acc.user_id} className={s.accountRow}>
              <div className={s.accountInfo}>
                <span className={s.accountName}>{acc.first_name} {acc.last_name}</span>
                <span className={s.accountEmail}>{acc.email}</span>
              </div>
              <div>
                {acc.tier_name
                  ? <span className={s.tierBadge}>{acc.tier_name}</span>
                  : <span className={s.tierBadgeNone}>Aucun palier</span>
                }
              </div>
              <span className={s.accountSpend}>
                CHF {roundCHF(parseFloat(acc.total_spend_chf ?? 0)).toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
              </span>
              <span className={s.rewardCount} data-positive={acc.available_rewards > 0 ? 'true' : 'false'}>
                {acc.available_rewards > 0 ? `${acc.available_rewards} bon${acc.available_rewards > 1 ? 's' : ''}` : '—'}
              </span>
              <span className={s.accountDate}>{formatDate(acc.updated_at)}</span>
            </div>
          ))
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={p => load(p)} />
    </>
  )
}

/* ── Onglet bons de réduction ── */
const REWARD_FILTERS = [
  { value: '',          label: 'Tous'        },
  { value: 'available', label: 'Disponibles' },
  { value: 'used',      label: 'Utilisés'    },
  { value: 'expired',   label: 'Expirés'     },
  { value: 'pending',   label: 'En attente'  },
]

const STATUS_LABELS = {
  available: 'Disponible',
  used:      'Utilisé',
  expired:   'Expiré',
  pending:   'En attente',
}

function RewardsTab() {
  const [rewards,  setRewards]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(false)
  const [page,     setPage]     = useState(1)
  const [total,    setTotal]    = useState(0)
  const [status,   setStatus]   = useState('')
  const LIMIT = 20

  const load = useCallback(async (p = 1) => {
    setError(false)
    setLoading(true)
    try {
      const params = { page: p, limit: LIMIT }
      if (status) params.status = status
      const res = await getLoyaltyRewards(params)
      setRewards(res.data ?? [])
      setTotal(res.pagination?.total ?? 0)
      setPage(p)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { load(1) }, [load])

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <>
      <div className={s.rewardFilters}>
        {REWARD_FILTERS.map(f => (
          <button
            key={f.value}
            className={`${s.filterBtn} ${status === f.value ? s.filterBtnActive : ''}`}
            onClick={() => { setStatus(f.value); setPage(1) }}
          >
            {f.label}
          </button>
        ))}
        <span className={s.accountTotal}>{total} bon{total !== 1 ? 's' : ''}</span>
      </div>

      {error && <ErrorBanner onRetry={() => load(page)} />}

      <div className={s.accountCard}>
        <div className={s.rewardListHead}>
          <span>Code</span>
          <span>Client</span>
          <span>Palier</span>
          <span>Valeur</span>
          <span>Statut</span>
          <span>Expiration</span>
        </div>

        {loading ? (
          Array.from({ length: 8 }).map((_, i) => <div key={i} className={s.skeletonRow} />)
        ) : rewards.length === 0 ? (
          <p className={s.empty}>Aucun bon dans cette catégorie.</p>
        ) : (
          rewards.map(r => (
            <div key={r.id} className={s.rewardRow}>
              <span className={s.rewardCode}>{r.code}</span>
              <div className={s.accountInfo}>
                <span className={s.accountName}>{r.first_name} {r.last_name}</span>
                <span className={s.accountEmail}>{r.email}</span>
              </div>
              <span className={s.tierBadgeSmall}>{r.tier_name}</span>
              <span className={s.rewardVal}>
                {r.type === 'fixed'
                  ? `CHF ${roundCHF(parseFloat(r.value)).toFixed(2)}`
                  : `${parseFloat(r.value)}%`
                }
              </span>
              <span className={s.rewardStatus} data-status={r.status}>
                {STATUS_LABELS[r.status] ?? r.status}
              </span>
              <span className={s.rewardExpiry}>{formatDate(r.expires_at)}</span>
            </div>
          ))
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={p => load(p)} />
    </>
  )
}

/* ── Page principale ── */
export default function Loyalty() {
  const [tab, setTab] = useState('tiers')

  return (
    <div className={s.page}>
      <div className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Programme de fidélité</h1>
          <p className={s.pageDesc}>Configurez les paliers et suivez les récompenses attribuées à vos clients.</p>
        </div>
      </div>

      <GlobalKpis />

      <div className={s.tabs}>
        {[
          { key: 'tiers',    label: 'Paliers & récompenses' },
          { key: 'accounts', label: 'Comptes clients'       },
          { key: 'rewards',  label: 'Bons de réduction'     },
        ].map(t => (
          <button
            key={t.key}
            className={`${s.tab} ${tab === t.key ? s.tabActive : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tiers'    && <TiersTab />}
      {tab === 'accounts' && <AccountsTab />}
      {tab === 'rewards'  && <RewardsTab />}
    </div>
  )
}
