import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, AlertTriangle, Check, Package, TrendingUp, AlertCircle, ShoppingBag,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  getSupplierDetails, createSupplier, updateSupplier,
} from '../../services/suppliers.service.js'
import { roundCHF } from '../../utils/chf.js'
import { useToast } from '../../contexts/ToastContext.jsx'
import s from './SupplierForm.module.css'

const schema = z.object({
  name:        z.string().min(1, 'Nom requis'),
  contactName: z.string().optional(),
  email:       z.string().email('E-mail invalide').optional().or(z.literal('')),
  phone:       z.string().optional(),
  address:     z.string().optional(),
  notes:       z.string().optional(),
  madeToOrderDelayMinWeeks: z.coerce.number().int().min(1).max(255).optional().or(z.literal('')),
  madeToOrderDelayMaxWeeks: z.coerce.number().int().min(1).max(255).optional().or(z.literal('')),
  isActive:    z.boolean().optional(),
}).refine(
  data => !data.madeToOrderDelayMinWeeks || !data.madeToOrderDelayMaxWeeks || data.madeToOrderDelayMaxWeeks >= data.madeToOrderDelayMinWeeks,
  { message: 'Le délai maximum doit être supérieur ou égal au délai minimum', path: ['madeToOrderDelayMaxWeeks'] }
)

// ── Page création/édition fournisseur ───────────────────────────────────────
export default function SupplierForm() {
  const navigate  = useNavigate()
  const { id }    = useParams()
  const toast     = useToast()
  const isEdit    = !!id

  const [supplier,  setSupplier]  = useState(null)
  const [loading,   setLoading]   = useState(isEdit)
  const [saved,     setSaved]     = useState(false)
  const [apiError,  setApiError]  = useState('')

  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { isActive: true },
  })

  /* Charge le fournisseur (+ KPIs, produits liés) en mode édition */
  useEffect(() => {
    if (!isEdit) return
    setLoading(true)
    getSupplierDetails(Number(id))
      .then(res => {
        setSupplier(res)
        reset({
          name:        res.name         ?? '',
          contactName: res.contact_name ?? '',
          email:       res.email        ?? '',
          phone:       res.phone        ?? '',
          address:     res.address      ?? '',
          notes:       res.notes        ?? '',
          madeToOrderDelayMinWeeks: res.made_to_order_delay_min_weeks ?? '',
          madeToOrderDelayMaxWeeks: res.made_to_order_delay_max_weeks ?? '',
          isActive:    !!res.is_active,
        })
      })
      .catch(() => setApiError('Impossible de charger ce fournisseur.'))
      .finally(() => setLoading(false))
  }, [isEdit, id, reset])

  const goBack = () => navigate('/fournisseurs')

  const onSubmit = async (formData) => {
    setApiError('')
    try {
      const data = {
        ...formData,
        madeToOrderDelayMinWeeks: formData.madeToOrderDelayMinWeeks || null,
        madeToOrderDelayMaxWeeks: formData.madeToOrderDelayMaxWeeks || null,
      }
      if (isEdit) {
        await updateSupplier(Number(id), data)
      } else {
        await createSupplier(data)
      }
      setSaved(true)
      toast.success(isEdit ? 'Fournisseur mis à jour.' : 'Fournisseur créé.')
      setTimeout(goBack, 500)
    } catch (err) {
      if (!err.response) {
        setApiError('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.')
        return
      }

      const { status, data } = err.response
      const fieldErrors = data?.errors
      if (fieldErrors?.length) {
        fieldErrors.forEach(({ field, message }) => {
          if (field in schema.shape) setError(field, { type: 'server', message })
        })
        return
      }

      if (status >= 500) {
        setApiError('Une erreur serveur est survenue. Veuillez réessayer dans un instant.')
      } else {
        setApiError(data?.message ?? 'Une erreur est survenue.')
      }
    }
  }

  if (loading) {
    return (
      <div className={s.page}>
        <p className={s.loadingText}>Chargement du fournisseur…</p>
      </div>
    )
  }

  return (
    <div className={s.page}>
      <div className={s.body}>
        {apiError && (
          <div className={s.apiError}><AlertTriangle size={13} /> {apiError}</div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} id="supplier-form" className={s.formSections}>
          {/* Coordonnées */}
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Coordonnées</h2>
            <div className={s.formGrid}>
              <div className={`${s.field} ${s.fieldFull}`}>
                <label className={s.label}>Nom de l'entreprise *</label>
                <input className={`${s.input} ${errors.name ? s.inputError : ''}`} {...register('name')} />
                {errors.name && <span className={s.err}>{errors.name.message}</span>}
              </div>

              <div className={s.field}>
                <label className={s.label}>Contact</label>
                <input className={s.input} placeholder="Prénom Nom" {...register('contactName')} />
              </div>

              <div className={s.field}>
                <label className={s.label}>E-mail</label>
                <input type="email" className={`${s.input} ${errors.email ? s.inputError : ''}`} {...register('email')} />
                {errors.email && <span className={s.err}>{errors.email.message}</span>}
              </div>

              <div className={s.field}>
                <label className={s.label}>Téléphone</label>
                <input type="tel" className={s.input} placeholder="+41 xx xxx xx xx" {...register('phone')} />
              </div>

              <div className={s.field}>
                <label className={s.label}>Adresse</label>
                <input className={s.input} placeholder="Rue, ville, pays" {...register('address')} />
              </div>

              <div className={`${s.field} ${s.fieldFull}`}>
                <label className={s.label}>Notes internes</label>
                <textarea
                  className={`${s.input} ${s.textarea}`}
                  rows={3}
                  placeholder="Conditions, délais, remarques…"
                  {...register('notes')}
                />
              </div>

              <label className={`${s.checkRow} ${s.fieldFull}`}>
                <input type="checkbox" {...register('isActive')} />
                <span>Fournisseur actif</span>
              </label>
            </div>
          </section>

          {/* Délai sur commande */}
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Délai sur commande</h2>
            <div className={s.formGrid}>
              <div className={s.field}>
                <label className={s.label}>Délai min (semaines)</label>
                <input
                  type="number"
                  className={`${s.input} ${errors.madeToOrderDelayMinWeeks ? s.inputError : ''}`}
                  placeholder="Optionnel — ex: 3"
                  {...register('madeToOrderDelayMinWeeks')}
                />
                {errors.madeToOrderDelayMinWeeks && <span className={s.err}>{errors.madeToOrderDelayMinWeeks.message}</span>}
              </div>

              <div className={s.field}>
                <label className={s.label}>Délai max (semaines)</label>
                <input
                  type="number"
                  className={`${s.input} ${errors.madeToOrderDelayMaxWeeks ? s.inputError : ''}`}
                  placeholder="Optionnel — ex: 4"
                  {...register('madeToOrderDelayMaxWeeks')}
                />
                {errors.madeToOrderDelayMaxWeeks && <span className={s.err}>{errors.madeToOrderDelayMaxWeeks.message}</span>}
              </div>

              <p className={`${s.fieldHint} ${s.fieldFull}`}>
                Ce délai ne s'applique qu'aux produits de ce fournisseur marqués « Sur commande ». Laissez vide si non concerné.
              </p>
            </div>
          </section>
        </form>

        {/* Produits liés — visible uniquement en édition */}
        {isEdit && supplier && (
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Aperçu</h2>

            <div className={s.kpiRow}>
              <div className={s.kpi}>
                <Package size={15} className={s.kpiIcon} />
                <span className={s.kpiVal}>{supplier.kpis.totalProducts}</span>
                <span className={s.kpiLbl}>Produit{supplier.kpis.totalProducts !== 1 ? 's' : ''}</span>
              </div>
              <div className={s.kpi}>
                <TrendingUp size={15} className={s.kpiIcon} />
                <span className={s.kpiVal}>{supplier.kpis.activeProducts}</span>
                <span className={s.kpiLbl}>Actif{supplier.kpis.activeProducts !== 1 ? 's' : ''}</span>
              </div>
              <div className={`${s.kpi} ${supplier.kpis.outOfStock > 0 ? s.kpiDanger : ''}`}>
                <AlertCircle size={15} className={s.kpiIcon} />
                <span className={s.kpiVal}>{supplier.kpis.outOfStock}</span>
                <span className={s.kpiLbl}>Rupture{supplier.kpis.outOfStock !== 1 ? 's' : ''}</span>
              </div>
              <div className={s.kpi}>
                <ShoppingBag size={15} className={s.kpiIcon} />
                <span className={s.kpiVal}>
                  CHF {roundCHF(supplier.kpis.stockValue).toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                </span>
                <span className={s.kpiLbl}>Valeur stock</span>
              </div>
            </div>

            <h3 className={s.subSectionTitle}><Package size={13} /> Produits liés</h3>
            {supplier.products.length === 0 ? (
              <p className={s.emptySection}>Aucun produit lié à ce fournisseur.</p>
            ) : (
              <div className={s.productList}>
                <div className={s.productListHead}>
                  <span>Produit</span>
                  <span>SKU</span>
                  <span>Prix</span>
                  <span>Stock</span>
                  <span>Statut</span>
                </div>
                {supplier.products.map(p => (
                  <div
                    key={p.id}
                    className={s.productListRow}
                    onClick={() => navigate(`/produits/${p.id}`)}
                  >
                    <span className={s.productName}>{p.name}</span>
                    <span className={s.productSku}>{p.sku ?? '—'}</span>
                    <span className={s.productPrice}>
                      CHF {roundCHF(parseFloat(p.price_chf)).toFixed(2)}
                    </span>
                    <span className={`${s.productStock} ${p.stock === 0 ? s.productStockOut : ''}`}>
                      {p.stock === 0 ? 'Rupture' : p.stock}
                    </span>
                    <span className={s.productActiveBadge} data-active={String(!!p.is_active)}>
                      {p.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <div className={s.actionBar}>
        <div className={s.actionBarInner}>
          <div className={s.actionBarLeft}>
            <button className={s.backBtn} onClick={goBack} aria-label="Retour à la liste">
              <ArrowLeft size={18} />
            </button>
            <h1 className={s.headerTitle}>
              {isEdit ? `Modifier — ${supplier?.name ?? ''}` : 'Nouveau fournisseur'}
            </h1>
          </div>
          <div className={s.actionBarRight}>
            <button type="button" className={s.btnCancel} onClick={goBack}>Annuler</button>
            <button type="submit" form="supplier-form" className={s.btnSaveLarge} disabled={isSubmitting || saved}>
              {saved
                ? <><Check size={16} /> Enregistré</>
                : isSubmitting ? 'Enregistrement…' : isEdit ? 'Enregistrer les modifications' : 'Créer le fournisseur'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
