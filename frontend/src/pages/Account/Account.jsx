import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  User, Package, MapPin, Heart, LogOut, ChevronRight,
  Check, AlertCircle, Plus, Pencil, Trash2, Star, X, Gift, Copy,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useWishlist } from '../../contexts/WishlistContext.jsx'
import { getMyOrders } from '../../services/orders.service.js'
import { updateProfile, updatePassword } from '../../services/profile.service.js'
import { getAddresses, createAddress, updateAddress, deleteAddress } from '../../services/addresses.service.js'
import { getLoyaltyAccount, getLoyaltyRewards } from '../../services/loyalty.service.js'
import { getWishlist } from '../../services/wishlist.service.js'
import { roundCHF } from '../../utils/chf.js'
import { normalizeLocale } from '../../utils/locale.js'
import { formatDate } from '../../utils/date.js'
import { STATUS_CFG } from '../../utils/orderStatus.js'
import s from './Account.module.css'

function useTabs(t, counts = {}) {
  return [
    { key: 'profile',  icon: User,    label: t('account.tabProfile') },
    { key: 'orders',   icon: Package, label: t('account.tabOrders'),   count: counts.orders },
    { key: 'wishlist', icon: Heart,   label: t('account.tabWishlist'), count: counts.wishlist },
  ]
}

/* ── Schémas Zod construits avec les messages traduits (t).
      Factory functions instanciées via useMemo dans chaque composant pour suivre la langue. ── */
const makeProfileSchema = (t) => z.object({
  first_name: z.string().min(1, t('account.val.firstNameRequired')),
  last_name:  z.string().min(1, t('account.val.lastNameRequired')),
  email:      z.string().email(t('account.val.emailInvalid')),
})

const makePasswordSchema = (t) => z.object({
  current_password: z.string().min(1, t('account.val.currentPasswordRequired')),
  new_password:     z.string().min(8, t('account.val.passwordMin')),
  confirm_password: z.string().min(1, t('account.val.confirmRequired')),
}).refine(d => d.new_password === d.confirm_password, {
  message: t('account.val.passwordsMismatch'),
  path: ['confirm_password'],
})

/* Cantons suisses officiels — code + nom (identique au checkout) */
const SWISS_CANTONS = [
  { code: 'AG', name: 'Argovie' }, { code: 'AI', name: 'Appenzell Rh.-Int.' },
  { code: 'AR', name: 'Appenzell Rh.-Ext.' }, { code: 'BE', name: 'Berne' },
  { code: 'BL', name: 'Bâle-Campagne' }, { code: 'BS', name: 'Bâle-Ville' },
  { code: 'FR', name: 'Fribourg' }, { code: 'GE', name: 'Genève' },
  { code: 'GL', name: 'Glaris' }, { code: 'GR', name: 'Grisons' },
  { code: 'JU', name: 'Jura' }, { code: 'LU', name: 'Lucerne' },
  { code: 'NE', name: 'Neuchâtel' }, { code: 'NW', name: 'Nidwald' },
  { code: 'OW', name: 'Obwald' }, { code: 'SG', name: 'Saint-Gall' },
  { code: 'SH', name: 'Schaffhouse' }, { code: 'SO', name: 'Soleure' },
  { code: 'SZ', name: 'Schwytz' }, { code: 'TG', name: 'Thurgovie' },
  { code: 'TI', name: 'Tessin' }, { code: 'UR', name: 'Uri' },
  { code: 'VD', name: 'Vaud' }, { code: 'VS', name: 'Valais' },
  { code: 'ZG', name: 'Zoug' }, { code: 'ZH', name: 'Zurich' },
]
const CANTON_CODES = SWISS_CANTONS.map(c => c.code)

const makeAddressSchema = (t) => z.object({
  label:        z.string().min(1, t('account.val.labelRequired')),
  address_type: z.enum(['shipping', 'billing', 'both']),
  street:        z.string().min(1, t('account.val.streetRequired')),
  street_number: z.string().min(1, t('account.val.streetNumberRequired')),
  zip:          z.string().regex(/^\d{4}$/, t('account.val.zipInvalid')),
  city:         z.string().min(1, t('account.val.cityRequired')),
  canton:       z.string().refine(v => CANTON_CODES.includes(v), t('account.val.cantonRequired')),
})

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span className={s.statusBadge} style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  )
}

/* ── Formulaire changement de mot de passe ── */
function PasswordForm() {
  const { t } = useTranslation()
  const passwordSchema = useMemo(() => makePasswordSchema(t), [t])
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
      setApiErr(err.response?.data?.message ?? t('account.genericError'))
    }
  }

  return (
    <>
      <h3 className={s.subTitle}>{t('account.changePassword')}</h3>

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
            {isSubmitting ? t('account.changingPassword') : t('account.changePassword')}
          </button>
        </div>
      </form>
    </>
  )
}

/* ── Onglet Profil ── */
function TabProfile({ user, onSaved }) {
  const { t } = useTranslation()
  const profileSchema = useMemo(() => makeProfileSchema(t), [t])
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
      setApiErr(t('account.genericErrorRetry'))
    }
  }

  return (
    <section className={s.panel}>
      <TabLoyalty />

      <hr className={s.sectionDivider} />

      <TabAddresses />

      <hr className={s.sectionDivider} />

      <h3 className={s.subTitle}>Mes informations</h3>

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
          <input id="acc-email" type="email" autoComplete="email" disabled
            className={s.input}
            {...register('email')} />
          <span className={s.fieldHint}>L'adresse e-mail ne peut pas être modifiée. Contactez-nous si besoin.</span>
        </div>

        <div className={s.formActions} style={{ marginBottom: 0 }}>
          <button type="submit" className={s.btnPrimary} disabled={isSubmitting || !isDirty}>
            {saved
              ? <><Check size={15} /> {t('account.saved')}</>
              : isSubmitting ? t('account.saving') : t('account.saveChanges')}
          </button>
        </div>
      </form>

      <hr className={s.sectionDivider} />

      <PasswordForm />
    </section>
  )
}

/* ── Section Commandes — tableau ── */
function TabOrders() {
  const navigate = useNavigate()
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
      <table className={s.dataTable}>
        <thead>
          <tr>
            <th>Commande</th>
            <th>Date</th>
            <th>Articles</th>
            <th>Total</th>
            <th>Statut</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id} className={s.dataRow} onClick={() => navigate(`/commandes/${o.id}`)}>
              <td className={s.dataRowStrong}>#{o.id}</td>
              <td className={s.dataRowMuted}>{formatDate(o.created_at)}</td>
              <td className={s.dataRowMuted}>{o.items_count} article{o.items_count > 1 ? 's' : ''}</td>
              <td className={s.dataRowStrong}>CHF {roundCHF(o.total).toFixed(2)}</td>
              <td><StatusBadge status={o.status} /></td>
              <td>
                <Link to={`/commandes/${o.id}`} className={s.orderDetailBtn} onClick={e => e.stopPropagation()}>
                  Détail <ChevronRight size={13} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/* ── Modal adresse ── */
function AddressModal({ initial, onSave, onClose }) {
  const { t } = useTranslation()
  const addressSchema = useMemo(() => makeAddressSchema(t), [t])
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(addressSchema),
    defaultValues: initial ?? { label: '', address_type: 'both', street: '', street_number: '', zip: '', city: '', canton: '' },
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
          <div className={s.formRow}>
            <div className={s.field}>
              <label htmlFor="addr-label" className={s.label}>Libellé <span className={s.requiredMark} aria-hidden="true">*</span></label>
              <input id="addr-label" type="text" placeholder="ex : Domicile, Bureau…" aria-required="true"
                className={`${s.input} ${errors.label ? s.inputError : ''}`}
                {...register('label')} />
              {errors.label && <span className={s.fieldError}><AlertCircle size={11} />{errors.label.message}</span>}
            </div>
            <div className={s.field}>
              <label htmlFor="addr-type" className={s.label}>Type d'adresse</label>
              <select id="addr-type" className={s.input} {...register('address_type')}>
                <option value="both">Livraison et facturation</option>
                <option value="shipping">Livraison uniquement</option>
                <option value="billing">Facturation uniquement</option>
              </select>
            </div>
          </div>
          <div className={s.formRowStreet}>
            <div className={s.field}>
              <label htmlFor="addr-street" className={s.label}>Rue <span className={s.requiredMark} aria-hidden="true">*</span></label>
              <input id="addr-street" type="text" placeholder="Rue de la Paix" aria-required="true"
                className={`${s.input} ${errors.street ? s.inputError : ''}`}
                {...register('street')} />
              {errors.street && <span className={s.fieldError}><AlertCircle size={11} />{errors.street.message}</span>}
            </div>
            <div className={s.field}>
              <label htmlFor="addr-street-number" className={s.label}>Numéro <span className={s.requiredMark} aria-hidden="true">*</span></label>
              <input id="addr-street-number" type="text" placeholder="12" aria-required="true"
                className={`${s.input} ${errors.street_number ? s.inputError : ''}`}
                {...register('street_number')} />
              {errors.street_number && <span className={s.fieldError}><AlertCircle size={11} />{errors.street_number.message}</span>}
            </div>
          </div>
          <div className={s.formRow}>
            <div className={s.field}>
              <label htmlFor="addr-zip" className={s.label}>NPA <span className={s.requiredMark} aria-hidden="true">*</span></label>
              <input id="addr-zip" type="text" maxLength={4} placeholder="1000" aria-required="true"
                className={`${s.input} ${errors.zip ? s.inputError : ''}`}
                {...register('zip')} />
              {errors.zip && <span className={s.fieldError}><AlertCircle size={11} />{errors.zip.message}</span>}
            </div>
            <div className={s.field}>
              <label htmlFor="addr-city" className={s.label}>Localité <span className={s.requiredMark} aria-hidden="true">*</span></label>
              <input id="addr-city" type="text" placeholder="Lausanne" aria-required="true"
                className={`${s.input} ${errors.city ? s.inputError : ''}`}
                {...register('city')} />
              {errors.city && <span className={s.fieldError}><AlertCircle size={11} />{errors.city.message}</span>}
            </div>
            <div className={s.field}>
              <label htmlFor="addr-canton" className={s.label}>Canton <span className={s.requiredMark} aria-hidden="true">*</span></label>
              <select id="addr-canton" aria-required="true"
                className={`${s.input} ${errors.canton ? s.inputError : ''}`}
                {...register('canton')}>
                <option value="" disabled>Sélectionnez…</option>
                {SWISS_CANTONS.map(c => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
              {errors.canton && <span className={s.fieldError}><AlertCircle size={11} />{errors.canton.message}</span>}
            </div>
          </div>
          <div className={s.formActions} style={{ marginTop: 8 }}>
            <button type="button" className={s.btnSecondary} onClick={onClose}>Annuler</button>
            <button type="submit" className={s.btnPrimary} disabled={isSubmitting}>
              {isSubmitting ? t('account.saving') : t('account.save')}
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
      <div className={s.skeletonList}>
        {[1,2].map(i => <div key={i} className={s.skeletonRow} />)}
      </div>
    )
  }

  return (
    <>
      <div className={s.panelHead}>
        <h3 className={s.subTitle}>Mes adresses</h3>
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
        <table className={s.dataTable}>
          <thead>
            <tr>
              <th>Libellé</th>
              <th>Adresse</th>
              <th>Type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {addresses.map(addr => (
              <tr
                key={addr.id}
                className={s.dataRow}
                onClick={() => setModal(addr)}
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && setModal(addr)}
                aria-label={`Modifier l'adresse ${addr.label || addr.street}`}
              >
                <td className={s.dataRowStrong}>
                  {addr.label || addr.street}
                  {!!addr.is_default && <span className={s.defaultBadgeInline}>Par défaut</span>}
                </td>
                <td className={s.dataRowMuted}>
                  {addr.street} {addr.street_number}, {addr.zip} {addr.city}{addr.canton ? ` (${addr.canton})` : ''}
                </td>
                <td className={s.dataRowMuted}>
                  {!addr.address_type || addr.address_type === 'both'
                    ? 'Livraison et facturation'
                    : addr.address_type === 'billing' ? 'Facturation' : 'Livraison'}
                </td>
                <td>
                  <div className={s.addressActions} onClick={e => e.stopPropagation()}>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal && (
        <AddressModal
          initial={modal === 'new' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </>
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
    getWishlist(normalizeLocale(i18n.language))
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
  const { t, i18n } = useTranslation()
  const locale = normalizeLocale(i18n.language)
  const [data,    setData]    = useState(null)
  const [rewards, setRewards] = useState([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState(null)

  function copyCode(id, code) {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

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
    <>
      <h3 className={s.subTitle}>{t('account.loyaltyTitle')}</h3>
      <div className={`${s.skeletonRow}`} style={{ height: 80, borderRadius: 10, marginBottom: 12 }} />
      <div className={`${s.skeletonRow}`} style={{ height: 80, borderRadius: 10 }} />
    </>
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
    available: { label: t('account.rewardStatus.available'), color: '#059669', bg: '#ecfdf5' },
    used:      { label: t('account.rewardStatus.used'),      color: '#6b7280', bg: '#f3f4f6' },
    expired:   { label: t('account.rewardStatus.expired'),   color: '#dc2626', bg: '#fef2f2' },
    pending:   { label: t('account.rewardStatus.pending'),   color: '#d97706', bg: '#fffbeb' },
  }

  return (
    <>
      <h3 className={s.subTitle}>{t('account.loyaltyTitle')}</h3>

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
          <p>{t('account.noRewards')}<br />{t('account.noRewardsCta')}</p>
        </div>
      ) : (
        <div className={s.rewardList}>
          {rewards.map(reward => {
            const cfg = STATUS_REWARD[reward.status] ?? STATUS_REWARD.pending
            const expires = reward.expires_at ? formatDate(reward.expires_at) : null
            return (
              <div key={reward.id} className={s.rewardItem}>
                <div className={s.rewardCodeWrap}>
                  <span className={s.rewardCode}>{reward.code}</span>
                  {reward.status === 'available' && (
                    <button
                      className={`${s.copyBtn} ${copiedId === reward.id ? s.copyBtnDone : ''}`}
                      onClick={() => copyCode(reward.id, reward.code)}
                      aria-label={t('account.copyCode')}
                      title={t('account.copyCode')}
                    >
                      {copiedId === reward.id ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedId === reward.id ? t('account.copied') : t('account.copy')}</span>
                    </button>
                  )}
                </div>
                <div className={s.rewardBottom}>
                  <div className={s.rewardValue}>
                    {reward.type === 'fixed'
                      ? `CHF ${parseFloat(reward.value).toFixed(2)}`
                      : `${parseFloat(reward.value).toFixed(0)}% de réduction`
                    }
                  </div>
                  <div className={s.rewardMeta}>
                    {expires && <span>{t('account.expiresOn', { date: expires })}</span>}
                  </div>
                  <span
                    className={s.rewardStatus}
                    style={{ color: cfg.color, background: cfg.bg }}
                  >
                    {cfg.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

/* ── Page principale — navigation par onglets classiques ──
   3 onglets seulement : Profil (regroupe infos perso, mot de passe, adresses, fidélité),
   Commandes, Favoris. Les anciennes clés (addresses, loyalty) restent acceptées dans l'URL
   pour ne pas casser les liens externes déjà en place ailleurs dans le site — elles
   redirigent simplement vers l'onglet Profil, où ce contenu vit désormais. */
const VALID_TABS = ['profile', 'orders', 'wishlist']
const TAB_ALIASES = { addresses: 'profile', loyalty: 'profile' }

export default function Account() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = TAB_ALIASES[searchParams.get('tab')] ?? searchParams.get('tab')
  const initialTab = VALID_TABS.includes(requestedTab ?? '') ? requestedTab : 'profile'
  const [tab, setTab] = useState(initialTab)
  const [userData, setUserData] = useState(user ?? {})
  const { ids: wishlistIds } = useWishlist()
  const [counts, setCounts] = useState({ orders: null })
  const tabs = useTabs(t, { ...counts, wishlist: wishlistIds.size || undefined })

  /* Badge de compteur commandes — appel léger (limit=1), lu depuis pagination.total */
  useEffect(() => {
    let cancelled = false
    getMyOrders({ limit: 1 }).then(res => {
      if (cancelled) return
      setCounts({ orders: res.pagination?.total ?? undefined })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  /* Liens externes (?tab=orders, ?tab=wishlist, ?tab=loyalty…) — ouvre directement le bon onglet */
  useEffect(() => {
    const raw = searchParams.get('tab')
    const target = TAB_ALIASES[raw] ?? raw
    if (target && VALID_TABS.includes(target)) setTab(target)
  }, [searchParams])

  const selectTab = (key) => {
    setTab(key)
    setSearchParams(key === 'profile' ? {} : { tab: key }, { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

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
          <Link to="/">{t('nav.home')}</Link>
          <ChevronRight size={13} />
          <span aria-current="page">{t('account.breadcrumb')}</span>
        </nav>
      </div>

      {/* ── Barre supérieure — avatar + navigation par onglets horizontale (desktop/tablette) ── */}
      <div className={s.topBar}>
        <div className={s.topBarAvatar}>
          <div className={s.avatar}>{initials}</div>
          <div>
            <p className={s.avatarName}>{firstName} {lastName}</p>
            <p className={s.avatarEmail}>{userData?.email}</p>
          </div>
        </div>

        <nav className={s.topTabNav} aria-label="Sections du compte">
          {tabs.map(({ key, icon: Icon, label, count }) => (
            <button
              key={key}
              className={`${s.topTabBtn} ${tab === key ? s.topTabActive : ''}`}
              onClick={() => selectTab(key)}
              aria-current={tab === key ? 'page' : undefined}
            >
              <Icon size={16} />
              <span>{label}</span>
              {!!count && <span className={s.tabBadge}>{count}</span>}
            </button>
          ))}
        </nav>

        <button className={s.topLogoutBtn} onClick={handleLogout}>
          <LogOut size={15} />
          <span>Déconnexion</span>
        </button>
      </div>

      {/* ── Contenu — un seul onglet affiché à la fois ── */}
      <div className={s.content}>
        {tab === 'profile' && (
          <TabProfile user={userData} onSaved={d => setUserData(u => ({
            ...u, ...d,
            firstName: d.first_name ?? d.firstName ?? u.firstName,
            lastName:  d.last_name  ?? d.lastName  ?? u.lastName,
          }))} />
        )}
        {tab === 'orders'   && <TabOrders />}
        {tab === 'wishlist' && <TabWishlist />}
      </div>

      {/* ── Barre de navigation mobile — style app, fixée en bas de l'écran ── */}
      <nav className={s.mobileTabBar} aria-label="Sections du compte">
        {tabs.map(({ key, icon: Icon, label, count }) => (
          <button
            key={key}
            className={`${s.mobileTabBtn} ${tab === key ? s.mobileTabActive : ''}`}
            onClick={() => selectTab(key)}
            aria-current={tab === key ? 'page' : undefined}
          >
            <span className={s.mobileTabIconWrap}>
              <Icon size={20} />
              {!!count && <span className={s.mobileTabDot}>{count > 9 ? '9+' : count}</span>}
            </span>
            <span>{label}</span>
          </button>
        ))}
        <button
          className={`${s.mobileTabBtn} ${s.mobileTabBtnLogout}`}
          onClick={handleLogout}
        >
          <span className={s.mobileTabIconWrap}>
            <LogOut size={20} />
          </span>
          <span>Déconnexion</span>
        </button>
      </nav>
    </div>
  )
}
