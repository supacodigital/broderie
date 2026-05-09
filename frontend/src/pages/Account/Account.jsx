import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  User, Package, MapPin, Heart, LogOut, ChevronRight,
  Check, AlertCircle, Plus, Pencil, Trash2, Star, X, Gift,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useWishlist } from '../../contexts/WishlistContext.jsx'
import { getMyOrders } from '../../services/orders.service.js'
import { updateProfile, updatePassword } from '../../services/profile.service.js'
import { getAddresses, createAddress, updateAddress, deleteAddress } from '../../services/addresses.service.js'
import { getLoyaltyAccount, getLoyaltyRewards } from '../../services/loyalty.service.js'
import { getWishlist } from '../../services/wishlist.service.js'
import { roundCHF } from '../../utils/chf.js'
import s from './Account.module.css'

const STATUS_CFG = {
  pending:   { label: 'En attente', color: '#d97706', bg: '#fffbeb' },
  paid:      { label: 'Payée',      color: '#059669', bg: '#ecfdf5' },
  shipped:   { label: 'Expédiée',   color: '#2563eb', bg: '#eff6ff' },
  delivered: { label: 'Livrée',     color: '#7c3aed', bg: '#f5f3ff' },
  cancelled: { label: 'Annulée',    color: '#dc2626', bg: '#fef2f2' },
  refunded:  { label: 'Remboursée', color: '#9d174d', bg: '#fdf2f8' },
}

const TABS = [
  { key: 'profile',   icon: User,    label: 'Profil' },
  { key: 'orders',    icon: Package, label: 'Commandes' },
  { key: 'addresses', icon: MapPin,  label: 'Adresses' },
  { key: 'wishlist',  icon: Heart,   label: 'Favoris' },
  { key: 'loyalty',   icon: Gift,    label: 'Fidélité' },
]

/* ── Schéma profil ── */
const profileSchema = z.object({
  first_name: z.string().min(1, 'Prénom requis'),
  last_name:  z.string().min(1, 'Nom requis'),
  email:      z.string().email('Email invalide'),
})

const passwordSchema = z.object({
  current_password: z.string().min(1, 'Mot de passe actuel requis'),
  new_password:     z.string().min(8, 'Minimum 8 caractères'),
  confirm_password: z.string().min(1, 'Confirmation requise'),
}).refine(d => d.new_password === d.confirm_password, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirm_password'],
})

/* ── Schéma adresse ── */
const addressSchema = z.object({
  label:  z.string().min(1, 'Libellé requis'),
  street: z.string().min(1, 'Rue requise'),
  zip:    z.string().regex(/^\d{4}$/, 'NPA suisse sur 4 chiffres'),
  city:   z.string().min(1, 'Ville requise'),
  canton: z.string().max(2).optional(),
})

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span className={s.statusBadge} style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  )
}

function formatDate(iso) {
  return new Intl.DateTimeFormat('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(iso))
}

/* ── Formulaire changement de mot de passe ── */
function PasswordForm() {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(passwordSchema),
  })
  const [saved,  setSaved]  = useState(false)
  const [apiErr, setApiErr] = useState('')

  const onSubmit = async (data) => {
    setApiErr('')
    try {
      await updatePassword(data.current_password, data.new_password)
      setSaved(true)
      reset()
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setApiErr(err.response?.data?.message ?? 'Une erreur est survenue.')
    }
  }

  return (
    <>
      <h2 className={s.panelTitle}>Modifier le mot de passe</h2>

      {apiErr && (
        <div className={s.alertError} role="alert">
          <AlertCircle size={15} /> {apiErr}
        </div>
      )}
      {saved && (
        <div className={s.alertSuccess} role="status">
          <Check size={15} /> Mot de passe modifié avec succès.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className={s.form}>
        <div className={s.field}>
          <label htmlFor="pwd-current" className={s.label}>Mot de passe actuel</label>
          <input id="pwd-current" type="password" autoComplete="current-password"
            className={`${s.input} ${errors.current_password ? s.inputError : ''}`}
            {...register('current_password')} />
          {errors.current_password && <span className={s.fieldError}><AlertCircle size={11} />{errors.current_password.message}</span>}
        </div>

        <div className={s.formRow}>
          <div className={s.field}>
            <label htmlFor="pwd-new" className={s.label}>Nouveau mot de passe</label>
            <input id="pwd-new" type="password" autoComplete="new-password"
              className={`${s.input} ${errors.new_password ? s.inputError : ''}`}
              {...register('new_password')} />
            {errors.new_password && <span className={s.fieldError}><AlertCircle size={11} />{errors.new_password.message}</span>}
          </div>
          <div className={s.field}>
            <label htmlFor="pwd-confirm" className={s.label}>Confirmer le nouveau mot de passe</label>
            <input id="pwd-confirm" type="password" autoComplete="new-password"
              className={`${s.input} ${errors.confirm_password ? s.inputError : ''}`}
              {...register('confirm_password')} />
            {errors.confirm_password && <span className={s.fieldError}><AlertCircle size={11} />{errors.confirm_password.message}</span>}
          </div>
        </div>

        <div className={s.formActions}>
          <button type="submit" className={s.btnPrimary} disabled={isSubmitting}>
            {isSubmitting ? 'Modification…' : 'Modifier le mot de passe'}
          </button>
        </div>
      </form>
    </>
  )
}

/* ── Bloc programme de fidélité (dans l'onglet Profil) ── */
function LoyaltyBlock() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getLoyaltyAccount()
      .then(res => { if (!cancelled) setData(res ?? null) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <>
        <h2 className={s.panelTitle}>Programme de fidélité</h2>
        <div className={`${s.loyaltyCard} ${s.skeletonRow}`} style={{ height: 64 }} />
      </>
    )
  }

  if (!data) return null

  const account   = data.account
  const tiers     = data.tiers ?? []
  const spendChf  = parseFloat(account?.total_spend_chf ?? 0)
  const currentTier = tiers.find(t => t.id === account?.current_tier_id) ?? null
  const nextTier    = tiers
    .filter(t => parseFloat(t.min_spend_chf) > spendChf)
    .sort((a, b) => parseFloat(a.min_spend_chf) - parseFloat(b.min_spend_chf))[0] ?? null
  const progressPct = nextTier
    ? Math.min(100, Math.round((spendChf / parseFloat(nextTier.min_spend_chf)) * 100))
    : 100

  return (
    <>
      <h2 className={s.panelTitle}>Programme de fidélité</h2>
      <div className={s.loyaltyCard}>
        <div className={s.loyaltyLeft}>
          <Star size={20} fill="currentColor" className={s.loyaltyStar} />
          <div>
            <p className={s.loyaltyTier}>{currentTier ? `Palier ${currentTier.name}` : 'Sans palier'}</p>
            <p className={s.loyaltySpend}>CHF {spendChf.toFixed(2)} d'achats cumulés</p>
          </div>
        </div>
        <Link to="/mon-compte" className={s.loyaltyLink}>
          Mes bons <ChevronRight size={14} />
        </Link>
      </div>
      {nextTier && (
        <div className={s.loyaltyProgress}>
          <div className={s.loyaltyProgressBar}>
            <div className={s.loyaltyProgressFill} style={{ width: `${progressPct}%` }} />
          </div>
          <p className={s.loyaltyProgressLabel}>
            Plus que CHF {(parseFloat(nextTier.min_spend_chf) - spendChf).toFixed(2)} pour atteindre le palier <strong>{nextTier.name}</strong>
          </p>
        </div>
      )}
    </>
  )
}

/* ── Onglet Profil ── */
function TabProfile({ user, onSaved }) {
  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: user?.firstName ?? user?.first_name ?? '',
      last_name:  user?.lastName  ?? user?.last_name  ?? '',
      email:      user?.email     ?? '',
    },
  })
  const [saved,  setSaved]  = useState(false)
  const [apiErr, setApiErr] = useState('')

  const onSubmit = async (data) => {
    setApiErr('')
    try {
      await updateProfile(data)
      setSaved(true)
      onSaved?.(data)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setApiErr('Une erreur est survenue. Veuillez réessayer.')
    }
  }

  return (
    <section className={s.panel}>
      <h2 className={s.panelTitle}>Mes informations</h2>

      {apiErr && (
        <div className={s.alertError} role="alert">
          <AlertCircle size={15} /> {apiErr}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className={s.form}>
        <div className={s.formRow}>
          <div className={s.field}>
            <label htmlFor="acc-first" className={s.label}>Prénom</label>
            <input id="acc-first" type="text" autoComplete="given-name"
              className={`${s.input} ${errors.first_name ? s.inputError : ''}`}
              {...register('first_name')} />
            {errors.first_name && <span className={s.fieldError}><AlertCircle size={11} />{errors.first_name.message}</span>}
          </div>
          <div className={s.field}>
            <label htmlFor="acc-last" className={s.label}>Nom</label>
            <input id="acc-last" type="text" autoComplete="family-name"
              className={`${s.input} ${errors.last_name ? s.inputError : ''}`}
              {...register('last_name')} />
            {errors.last_name && <span className={s.fieldError}><AlertCircle size={11} />{errors.last_name.message}</span>}
          </div>
        </div>

        <div className={s.field}>
          <label htmlFor="acc-email" className={s.label}>Adresse e-mail</label>
          <input id="acc-email" type="email" autoComplete="email"
            className={`${s.input} ${errors.email ? s.inputError : ''}`}
            {...register('email')} />
          {errors.email && <span className={s.fieldError}><AlertCircle size={11} />{errors.email.message}</span>}
        </div>

        <div className={s.formActions}>
          <button type="submit" className={s.btnPrimary} disabled={isSubmitting || !isDirty}>
            {saved
              ? <><Check size={15} /> Enregistré</>
              : isSubmitting ? 'Enregistrement…' : 'Enregistrer les modifications'}
          </button>
        </div>
      </form>

      <PasswordForm />

      <LoyaltyBlock />
    </section>
  )
}

/* ── Onglet Commandes ── */
function TabOrders() {
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getMyOrders({ limit: 20 })
      .then(d => { if (!cancelled) setOrders(d.data ?? []) })
      .catch(() => { if (!cancelled) setOrders([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <section className={s.panel}>
        <h2 className={s.panelTitle}>Mes commandes</h2>
        <div className={s.skeletonList}>
          {[1,2,3].map(i => <div key={i} className={s.skeletonRow} />)}
        </div>
      </section>
    )
  }

  if (!orders.length) {
    return (
      <section className={s.panel}>
        <h2 className={s.panelTitle}>Mes commandes</h2>
        <div className={s.emptyState}>
          <Package size={40} className={s.emptyIcon} />
          <p className={s.emptyTitle}>Aucune commande</p>
          <p className={s.emptyDesc}>Vous n'avez pas encore passé de commande.</p>
          <Link to="/catalogue" className={s.btnPrimary}>Découvrir le catalogue</Link>
        </div>
      </section>
    )
  }

  return (
    <section className={s.panel}>
      <h2 className={s.panelTitle}>Mes commandes <span className={s.countBadge}>{orders.length}</span></h2>
      <div className={s.orderList}>
        {orders.map(o => (
          <div key={o.id} className={s.orderCard}>
            <div className={s.orderTop}>
              <div>
                <span className={s.orderId}>Commande #{o.id}</span>
                <span className={s.orderDate}>{formatDate(o.created_at)}</span>
              </div>
              <StatusBadge status={o.status} />
            </div>
            <div className={s.orderBottom}>
              <span className={s.orderItems}>{o.items_count} article{o.items_count > 1 ? 's' : ''}</span>
              <span className={s.orderTotal}>CHF {roundCHF(o.total).toFixed(2)}</span>
              <Link to={`/commandes/${o.id}`} className={s.orderDetailBtn}>
                Détail <ChevronRight size={13} />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Modal adresse ── */
function AddressModal({ initial, onSave, onClose }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(addressSchema),
    defaultValues: initial ?? { label: '', street: '', zip: '', city: '', canton: '' },
  })

  const onSubmit = async (data) => {
    await onSave(data)
    onClose()
  }

  return (
    <div className={s.modalOverlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <h3 className={s.modalTitle}>{initial ? 'Modifier l\'adresse' : 'Nouvelle adresse'}</h3>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className={s.form}>
          <div className={s.field}>
            <label htmlFor="addr-label" className={s.label}>Libellé</label>
            <input id="addr-label" type="text" placeholder="ex : Domicile, Bureau…"
              className={`${s.input} ${errors.label ? s.inputError : ''}`}
              {...register('label')} />
            {errors.label && <span className={s.fieldError}><AlertCircle size={11} />{errors.label.message}</span>}
          </div>
          <div className={s.field}>
            <label htmlFor="addr-street" className={s.label}>Rue et numéro</label>
            <input id="addr-street" type="text" placeholder="Rue de la Paix 12"
              className={`${s.input} ${errors.street ? s.inputError : ''}`}
              {...register('street')} />
            {errors.street && <span className={s.fieldError}><AlertCircle size={11} />{errors.street.message}</span>}
          </div>
          <div className={s.formRow}>
            <div className={s.field}>
              <label htmlFor="addr-zip" className={s.label}>NPA</label>
              <input id="addr-zip" type="text" maxLength={4} placeholder="1000"
                className={`${s.input} ${errors.zip ? s.inputError : ''}`}
                {...register('zip')} />
              {errors.zip && <span className={s.fieldError}><AlertCircle size={11} />{errors.zip.message}</span>}
            </div>
            <div className={s.field}>
              <label htmlFor="addr-city" className={s.label}>Localité</label>
              <input id="addr-city" type="text" placeholder="Lausanne"
                className={`${s.input} ${errors.city ? s.inputError : ''}`}
                {...register('city')} />
              {errors.city && <span className={s.fieldError}><AlertCircle size={11} />{errors.city.message}</span>}
            </div>
            <div className={s.field}>
              <label htmlFor="addr-canton" className={s.label}>Canton</label>
              <input id="addr-canton" type="text" maxLength={2} placeholder="VD"
                className={s.input}
                {...register('canton')} />
            </div>
          </div>
          <div className={s.formActions} style={{ marginTop: 8 }}>
            <button type="button" className={s.btnSecondary} onClick={onClose}>Annuler</button>
            <button type="submit" className={s.btnPrimary} disabled={isSubmitting}>
              {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Onglet Adresses ── */
function TabAddresses() {
  const [addresses, setAddresses] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(null) /* null | 'new' | {address} */

  useEffect(() => {
    let cancelled = false
    getAddresses()
      .then(d => { if (!cancelled) setAddresses(d.data ?? []) })
      .catch(() => { if (!cancelled) setAddresses([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const handleSave = async (data) => {
    try {
      if (modal?.id) {
        await updateAddress(modal.id, data)
        setAddresses(prev => prev.map(a => a.id === modal.id ? { ...a, ...data } : a))
      } else {
        const res = await createAddress(data)
        const newAddr = res.data ?? { ...data, id: Date.now(), is_default: false }
        setAddresses(prev => [...prev, newAddr])
      }
    } catch {
      /* continue sans bloquer l'UI */
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteAddress(id)
    } catch { /* continue même si l'API échoue */ }
    setAddresses(prev => prev.filter(a => a.id !== id))
  }

  if (loading) {
    return (
      <section className={s.panel}>
        <h2 className={s.panelTitle}>Mes adresses</h2>
        <div className={s.skeletonList}>
          {[1,2].map(i => <div key={i} className={s.skeletonRow} />)}
        </div>
      </section>
    )
  }

  return (
    <section className={s.panel}>
      <div className={s.panelHead}>
        <h2 className={s.panelTitle}>Mes adresses</h2>
        <button className={s.btnOutline} onClick={() => setModal('new')}>
          <Plus size={14} /> Ajouter
        </button>
      </div>

      {addresses.length === 0 ? (
        <div className={s.emptyState}>
          <MapPin size={40} className={s.emptyIcon} />
          <p className={s.emptyTitle}>Aucune adresse</p>
          <p className={s.emptyDesc}>Ajoutez une adresse de livraison pour accélérer votre prochain achat.</p>
          <button className={s.btnPrimary} onClick={() => setModal('new')}>
            <Plus size={14} /> Ajouter une adresse
          </button>
        </div>
      ) : (
        <div className={s.addressGrid}>
          {addresses.map(addr => (
            <div key={addr.id} className={`${s.addressCard} ${addr.is_default ? s.addressDefault : ''}`}>
              {!!addr.is_default && <span className={s.defaultBadge}>Par défaut</span>}
              {addr.label && addr.label !== addr.street && (
                <p className={s.addressLabel}>{addr.label}</p>
              )}
              <p className={s.addressLine}>{addr.street}</p>
              <p className={s.addressLine}>{addr.zip} {addr.city}{addr.canton ? ` (${addr.canton})` : ''}</p>
              <p className={s.addressLine}>Suisse</p>
              <div className={s.addressActions}>
                <button className={s.iconActionBtn} onClick={() => setModal(addr)} aria-label="Modifier">
                  <Pencil size={13} /> Modifier
                </button>
                {!addr.is_default && (
                  <button className={`${s.iconActionBtn} ${s.iconActionBtnDanger}`}
                    onClick={() => handleDelete(addr.id)} aria-label="Supprimer">
                    <Trash2 size={13} /> Supprimer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <AddressModal
          initial={modal === 'new' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  )
}

/* ── Onglet Wishlist ── */
function TabWishlist() {
  const { i18n } = useTranslation()
  const { toggle } = useWishlist()
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getWishlist(i18n.language?.split('-')[0] ?? 'fr')
      .then(d => { if (!cancelled) setItems(d.data ?? []) })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [i18n.language])

  const handleRemove = async (productId) => {
    setItems(prev => prev.filter(i => i.product_id !== productId))
    toggle(productId)
  }

  if (loading) {
    return (
      <section className={s.panel}>
        <h2 className={s.panelTitle}>Mes favoris</h2>
        <div className={s.skeletonList}>
          {[1,2,3].map(i => <div key={i} className={s.skeletonRow} />)}
        </div>
      </section>
    )
  }

  if (!items.length) {
    return (
      <section className={s.panel}>
        <h2 className={s.panelTitle}>Mes favoris</h2>
        <div className={s.emptyState}>
          <Heart size={40} className={s.emptyIcon} />
          <p className={s.emptyTitle}>Aucun favori</p>
          <p className={s.emptyDesc}>Ajoutez des produits à vos favoris depuis le catalogue.</p>
          <Link to="/catalogue" className={s.btnPrimary}>Découvrir le catalogue</Link>
        </div>
      </section>
    )
  }

  return (
    <section className={s.panel}>
      <h2 className={s.panelTitle}>Mes favoris <span className={s.countBadge}>{items.length}</span></h2>
      <div className={s.wishlistGrid}>
        {items.map(item => (
          <div key={item.id} className={s.wishlistCard}>
            <button
              className={s.wishlistRemove}
              onClick={() => handleRemove(item.product_id)}
              aria-label={`Retirer ${item.product_name} des favoris`}
            >
              <X size={14} />
            </button>
            <Link to={`/produit/${item.slug}`} className={s.wishlistImgWrap}>
              {item.image_url
                ? <img src={item.image_url} alt={item.product_name} className={s.wishlistImg} loading="lazy" />
                : <div className={s.wishlistImgFallback} aria-hidden="true">🧵</div>
              }
              {item.stock === 0 && <span className={s.outOfStockBadge}>Épuisé</span>}
            </Link>
            <div className={s.wishlistInfo}>
              <Link to={`/produit/${item.slug}`} className={s.wishlistName}>{item.product_name}</Link>
              <div className={s.wishlistPrices}>
                <span className={s.wishlistPrice}>CHF {roundCHF(parseFloat(item.price_chf)).toFixed(2)}</span>
                {item.compare_price_chf && (
                  <span className={s.wishlistOldPrice}>CHF {roundCHF(parseFloat(item.compare_price_chf)).toFixed(2)}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Onglet Fidélité ── */
function TabLoyalty() {
  const [data,    setData]    = useState(null)
  const [rewards, setRewards] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([getLoyaltyAccount(), getLoyaltyRewards()])
      .then(([meRes, rewardsRes]) => {
        if (cancelled) return
        setData(meRes ?? null)
        setRewards(rewardsRes ?? [])
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) return (
    <section className={s.panel}>
      <h2 className={s.panelTitle}>Programme de fidélité</h2>
      <div className={`${s.skeletonRow}`} style={{ height: 80, borderRadius: 10, marginBottom: 12 }} />
      <div className={`${s.skeletonRow}`} style={{ height: 80, borderRadius: 10 }} />
    </section>
  )

  const account    = data?.account ?? null
  const tiers      = data?.tiers ?? []
  const spendChf   = parseFloat(account?.total_spend_chf ?? 0)
  const currentTier = tiers.find(t => t.id === account?.current_tier_id) ?? null
  const nextTier    = tiers
    .filter(t => parseFloat(t.min_spend_chf) > spendChf)
    .sort((a, b) => parseFloat(a.min_spend_chf) - parseFloat(b.min_spend_chf))[0] ?? null
  const progressPct = nextTier
    ? Math.min(100, Math.round((spendChf / parseFloat(nextTier.min_spend_chf)) * 100))
    : 100

  const STATUS_REWARD = {
    available: { label: 'Disponible', color: '#059669', bg: '#ecfdf5' },
    used:      { label: 'Utilisé',    color: '#6b7280', bg: '#f3f4f6' },
    expired:   { label: 'Expiré',     color: '#dc2626', bg: '#fef2f2' },
    pending:   { label: 'En attente', color: '#d97706', bg: '#fffbeb' },
  }

  return (
    <section className={s.panel}>
      <h2 className={s.panelTitle}>Programme de fidélité</h2>

      {/* Carte palier actuel */}
      <div className={s.loyaltyCard}>
        <div className={s.loyaltyLeft}>
          <Star size={20} fill="currentColor" className={s.loyaltyStar} />
          <div>
            <p className={s.loyaltyTier}>{currentTier ? `Palier ${currentTier.name}` : 'Sans palier'}</p>
            <p className={s.loyaltySpend}>CHF {spendChf.toFixed(2)} d'achats cumulés</p>
          </div>
        </div>
      </div>

      {/* Barre progression */}
      {nextTier && (
        <div className={s.loyaltyProgress}>
          <div className={s.loyaltyProgressBar}>
            <div className={s.loyaltyProgressFill} style={{ width: `${progressPct}%` }} />
          </div>
          <p className={s.loyaltyProgressLabel}>
            Plus que CHF {(parseFloat(nextTier.min_spend_chf) - spendChf).toFixed(2)} pour atteindre le palier <strong>{nextTier.name}</strong>
          </p>
        </div>
      )}
      {!nextTier && currentTier && (
        <p className={s.loyaltyProgressLabel} style={{ marginTop: 8 }}>
          Vous êtes au palier maximum. Merci pour votre fidélité !
        </p>
      )}

      {/* Paliers disponibles */}
      {tiers.length > 0 && (
        <>
          <h3 className={s.subTitle} style={{ marginTop: 24 }}>Les paliers</h3>
          <div className={s.tierList}>
            {tiers.map(tier => (
              <div key={tier.id} className={`${s.tierItem} ${tier.id === account?.current_tier_id ? s.tierActive : ''}`}>
                <div className={s.tierName}>{tier.name}</div>
                <div className={s.tierMeta}>
                  Dès CHF {parseFloat(tier.min_spend_chf).toFixed(0)} d'achats
                  &nbsp;·&nbsp;
                  Récompense : {tier.reward_type === 'fixed'
                    ? `CHF ${parseFloat(tier.reward_value).toFixed(2)}`
                    : `${parseFloat(tier.reward_value).toFixed(0)}%`
                  }
                  &nbsp;·&nbsp;
                  Valable {tier.reward_validity_days} jours
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Bons de réduction */}
      <h3 className={s.subTitle} style={{ marginTop: 24 }}>
        Mes bons <span className={s.countBadge}>{rewards.filter(r => r.status === 'available').length}</span>
      </h3>
      {rewards.length === 0 ? (
        <div className={s.emptyState}>
          <Gift size={28} />
          <p>Aucun bon pour le moment.<br />Continuez vos achats pour débloquer des récompenses !</p>
        </div>
      ) : (
        <div className={s.rewardList}>
          {rewards.map(reward => {
            const cfg = STATUS_REWARD[reward.status] ?? STATUS_REWARD.pending
            const expires = reward.expires_at ? new Date(reward.expires_at).toLocaleDateString('fr-CH') : null
            return (
              <div key={reward.id} className={s.rewardItem}>
                <div className={s.rewardCode}>{reward.code}</div>
                <div className={s.rewardValue}>
                  {reward.type === 'fixed'
                    ? `CHF ${parseFloat(reward.value).toFixed(2)}`
                    : `${parseFloat(reward.value).toFixed(0)}% de réduction`
                  }
                </div>
                <div className={s.rewardMeta}>
                  {expires && <span>Expire le {expires}</span>}
                </div>
                <span
                  className={s.rewardStatus}
                  style={{ color: cfg.color, background: cfg.bg }}
                >
                  {cfg.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

/* ── Page principale ── */
export default function Account() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('profile')
  const [userData, setUserData] = useState(user ?? {})

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const firstName = userData?.firstName ?? userData?.first_name ?? ''
  const lastName  = userData?.lastName  ?? userData?.last_name  ?? ''
  const initials  = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()

  return (
    <div className={s.page}>
      {/* ── En-tête ── */}
      <div className={s.pageHead}>
        <nav className={s.breadcrumb} aria-label="Fil d'Ariane">
          <Link to="/">Accueil</Link>
          <ChevronRight size={13} />
          <span aria-current="page">Mon compte</span>
        </nav>
      </div>

      <div className={s.layout}>
        {/* ── Sidebar ── */}
        <aside className={s.sidebar}>
          {/* Avatar */}
          <div className={s.avatarWrap}>
            <div className={s.avatar}>{initials}</div>
            <div>
              <p className={s.avatarName}>{firstName} {lastName}</p>
              <p className={s.avatarEmail}>{userData?.email}</p>
            </div>
          </div>

          {/* Onglets */}
          <nav className={s.tabNav} aria-label="Sections du compte">
            {TABS.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                className={`${s.tabBtn} ${tab === key ? s.tabActive : ''}`}
                onClick={() => setTab(key)}
                aria-current={tab === key ? 'page' : undefined}
              >
                <Icon size={16} />
                <span>{label}</span>
                <ChevronRight size={13} className={s.tabArrow} />
              </button>
            ))}
          </nav>

          <hr className={s.divider} />

          <button className={s.logoutBtn} onClick={handleLogout}>
            <LogOut size={15} />
            Déconnexion
          </button>
        </aside>

        {/* ── Contenu ── */}
        <div className={s.content}>
          {tab === 'profile'   && <TabProfile user={userData} onSaved={d => setUserData(u => ({
            ...u, ...d,
            firstName: d.first_name ?? d.firstName ?? u.firstName,
            lastName:  d.last_name  ?? d.lastName  ?? u.lastName,
          }))} />}
          {tab === 'orders'    && <TabOrders />}
          {tab === 'addresses' && <TabAddresses />}
          {tab === 'wishlist'  && <TabWishlist />}
          {tab === 'loyalty'   && <TabLoyalty />}
        </div>
      </div>
    </div>
  )
}
