import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Plus, Edit2, Trash2, Search, X, Check, AlertTriangle,
  Package, TrendingUp, AlertCircle, ShoppingBag,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getSuppliers, getSupplierDetails, createSupplier, updateSupplier, deleteSupplier } from '../../services/suppliers.service.js'
import { roundCHF } from '../../utils/chf.js'
import ConfirmDialog from '../../components/ui/ConfirmDialog/ConfirmDialog.jsx'
import s from './Suppliers.module.css'

const schema = z.object({
  name:        z.string().min(1, 'Nom requis'),
  contactName: z.string().optional(),
  email:       z.string().email('E-mail invalide').optional().or(z.literal('')),
  phone:       z.string().optional(),
  address:     z.string().optional(),
  notes:       z.string().optional(),
  isActive:    z.boolean().optional(),
})

/* ── Modale création/édition ── */
function SupplierFormModal({ supplier, onClose, onSaved }) {
  const isEdit = !!supplier
  const [apiError, setApiError] = useState('')
  const [saved,    setSaved]    = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: isEdit ? {
      name:        supplier.name         ?? '',
      contactName: supplier.contact_name ?? '',
      email:       supplier.email        ?? '',
      phone:       supplier.phone        ?? '',
      address:     supplier.address      ?? '',
      notes:       supplier.notes        ?? '',
      isActive:    !!supplier.is_active,
    } : { isActive: true },
  })

  const onSubmit = async (data) => {
    setApiError('')
    try {
      if (isEdit) {
        await updateSupplier(supplier.id, data)
      } else {
        await createSupplier(data)
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
          <h2 className={s.modalTitle}>
            {isEdit ? `Modifier — ${supplier.name}` : 'Nouveau fournisseur'}
          </h2>
          <button className={s.closeBtn} onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className={s.modalBody}>
          {apiError && (
            <div className={s.apiError}><AlertTriangle size={13} /> {apiError}</div>
          )}

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

            <div className={`${s.field} ${s.fieldFull}`}>
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
          </div>

          <label className={s.checkRow}>
            <input type="checkbox" {...register('isActive')} />
            <span>Fournisseur actif</span>
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

/* ── Modale fiche détail fournisseur ── */
function SupplierDetailModal({ supplierId, onClose, onEdit }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    getSupplierDetails(supplierId)
      .then(res => setData(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [supplierId])

  return (
    <div
      className={s.overlay}
      onClick={onClose}
      onKeyDown={e => e.key === 'Escape' && onClose()}
      tabIndex={-1}
    >
      <div className={s.detailModal} onClick={e => e.stopPropagation()}>

        {/* En-tête */}
        <div className={s.detailHead}>
          <div className={s.detailHeadLeft}>
            {data && <div className={s.detailIcon}>{data.name?.[0]?.toUpperCase() ?? '?'}</div>}
            <div>
              <h2 className={s.modalTitle}>{data ? data.name : 'Fiche fournisseur'}</h2>
              {data && (
                <span className={s.activeBadge} data-active={String(!!data.is_active)}>
                  {data.is_active ? 'Actif' : 'Inactif'}
                </span>
              )}
            </div>
          </div>
          <div className={s.detailHeadRight}>
            {data && (
              <button className={s.btnEdit} onClick={() => onEdit(data)}>
                <Edit2 size={13} /> Modifier
              </button>
            )}
            <button className={s.closeBtn} onClick={onClose} aria-label="Fermer"><X size={16} /></button>
          </div>
        </div>

        {loading ? (
          <div className={s.detailLoading}><div className={s.spinner} /></div>
        ) : error ? (
          <p className={s.detailError}><AlertTriangle size={14} /> Impossible de charger ce fournisseur.</p>
        ) : !data ? (
          <p className={s.detailError}>Fournisseur introuvable.</p>
        ) : (
          <div className={s.detailBody}>

            {/* Coordonnées */}
            <div className={s.coordBlock}>
              {[
                { label: 'Contact',   value: data.contact_name },
                { label: 'E-mail',    value: data.email,   href: `mailto:${data.email}` },
                { label: 'Téléphone', value: data.phone,   href: `tel:${data.phone}` },
                { label: 'Adresse',   value: data.address },
              ].filter(r => r.value).map(row => (
                <div key={row.label} className={s.coordRow}>
                  <span className={s.coordLabel}>{row.label}</span>
                  {row.href
                    ? <a href={row.href} className={s.coordLink}>{row.value}</a>
                    : <span className={s.coordValue}>{row.value}</span>
                  }
                </div>
              ))}
              {data.notes && (
                <div className={s.coordRow}>
                  <span className={s.coordLabel}>Notes</span>
                  <span className={s.coordValue}>{data.notes}</span>
                </div>
              )}
            </div>

            {/* KPIs */}
            <div className={s.kpiRow}>
              <div className={s.kpi}>
                <Package size={15} className={s.kpiIcon} />
                <span className={s.kpiVal}>{data.kpis.totalProducts}</span>
                <span className={s.kpiLbl}>Produit{data.kpis.totalProducts !== 1 ? 's' : ''}</span>
              </div>
              <div className={s.kpi}>
                <TrendingUp size={15} className={s.kpiIcon} />
                <span className={s.kpiVal}>{data.kpis.activeProducts}</span>
                <span className={s.kpiLbl}>Actif{data.kpis.activeProducts !== 1 ? 's' : ''}</span>
              </div>
              <div className={`${s.kpi} ${data.kpis.outOfStock > 0 ? s.kpiDanger : ''}`}>
                <AlertCircle size={15} className={s.kpiIcon} />
                <span className={s.kpiVal}>{data.kpis.outOfStock}</span>
                <span className={s.kpiLbl}>Rupture{data.kpis.outOfStock !== 1 ? 's' : ''}</span>
              </div>
              <div className={s.kpi}>
                <ShoppingBag size={15} className={s.kpiIcon} />
                <span className={s.kpiVal}>
                  CHF {roundCHF(data.kpis.stockValue).toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                </span>
                <span className={s.kpiLbl}>Valeur stock</span>
              </div>
            </div>

            {/* Liste produits */}
            <h3 className={s.sectionTitle}><Package size={13} /> Produits liés</h3>
            {data.products.length === 0 ? (
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
                {data.products.map(p => (
                  <div key={p.id} className={s.productListRow}>
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

          </div>
        )}
      </div>
    </div>
  )
}

/* ── Page principale ── */
export default function Suppliers() {
  const [suppliers,  setSuppliers]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(false)
  const [search,     setSearch]     = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [formModal,  setFormModal]  = useState(null)   // null | 'new' | supplier object
  const [detailId,   setDetailId]   = useState(null)   // id fournisseur pour la modal détail
  const [deleteError, setDeleteError] = useState(null)
  const [confirm,    setConfirm]    = useState(null)
  const debounceRef = useRef(null)

  const handleSearch = (val) => {
    setSearch(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300)
  }

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: 100 })
      if (debouncedSearch) params.set('q', debouncedSearch)
      const res = await getSuppliers(Object.fromEntries(params))
      setSuppliers(res.data ?? [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch])

  useEffect(() => { load() }, [load])

  const handleDelete = (id, e) => {
    e.stopPropagation()
    setConfirm({
      message: 'Supprimer ce fournisseur ? Les produits liés ne seront pas supprimés.',
      onConfirm: async () => {
        setDeleteError(null)
        try {
          await deleteSupplier(id)
          setSuppliers(prev => prev.filter(s => s.id !== id))
        } catch (err) {
          setDeleteError(err.response?.data?.message ?? 'Erreur lors de la suppression.')
        }
      },
    })
  }

  /* Ouvrir le formulaire d'édition depuis la modal détail */
  const handleEditFromDetail = (supplier) => {
    setDetailId(null)
    setTimeout(() => setFormModal(supplier), 50)
  }

  return (
    <div className={s.page}>
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
      {/* Modal détail fournisseur */}
      {detailId && (
        <SupplierDetailModal
          supplierId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={handleEditFromDetail}
        />
      )}

      {/* Modal création/édition */}
      {formModal && (
        <SupplierFormModal
          supplier={formModal === 'new' ? null : formModal}
          onClose={() => setFormModal(null)}
          onSaved={load}
        />
      )}

      <div className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Fournisseurs</h1>
          <p className={s.pageSub}>{suppliers.length} fournisseur{suppliers.length > 1 ? 's' : ''}</p>
        </div>
        <button className={s.btnPrimary} onClick={() => setFormModal('new')}>
          <Plus size={16} /> Nouveau fournisseur
        </button>
      </div>

      <div className={s.toolbar}>
        <div className={s.searchWrap}>
          <Search size={14} className={s.searchIcon} />
          <input
            type="search"
            className={s.searchInput}
            placeholder="Rechercher un fournisseur…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
      </div>

      {(error || deleteError) && (
        <div className={s.errorBanner}>
          <AlertTriangle size={14} />
          {deleteError ?? 'Erreur de chargement.'}
          {!deleteError && <button className={s.retryBtn} onClick={load}>Réessayer</button>}
        </div>
      )}

      {loading ? (
        <div className={s.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={s.skeleton} />
          ))}
        </div>
      ) : suppliers.length === 0 ? (
        <p className={s.empty}>
          {debouncedSearch ? 'Aucun fournisseur trouvé.' : 'Aucun fournisseur enregistré.'}
        </p>
      ) : (
        <div className={s.grid}>
          {suppliers.map(sup => (
            <div
              key={sup.id}
              className={s.supplierCard}
              onClick={() => setDetailId(sup.id)}
            >
              <div className={s.supHead}>
                <div className={s.supIcon}>{sup.name?.[0]?.toUpperCase() ?? '?'}</div>
                <div className={s.supInfo}>
                  <p className={s.supName}>{sup.name}</p>
                  {sup.contact_name && <p className={s.supContact}>{sup.contact_name}</p>}
                </div>
                <span className={s.activeBadge} data-active={String(!!sup.is_active)}>
                  {sup.is_active ? 'Actif' : 'Inactif'}
                </span>
              </div>

              <div className={s.supDetails}>
                {sup.email   && <p className={s.supDetail}><span className={s.supDetailIcon}>@</span>{sup.email}</p>}
                {sup.phone   && <p className={s.supDetail}><span className={s.supDetailIcon}>✆</span>{sup.phone}</p>}
                {sup.address && <p className={s.supDetail}><span className={s.supDetailIcon}>⌖</span>{sup.address}</p>}
              </div>

              {/* Badge nombre de produits */}
              <div className={s.supFooter}>
                <span className={s.productCountBadge}>
                  <Package size={11} />
                  {sup.product_count ?? 0} produit{(sup.product_count ?? 0) !== 1 ? 's' : ''}
                </span>
                <div className={s.supActions} onClick={e => e.stopPropagation()}>
                  <button
                    className={s.iconBtn}
                    onClick={e => { e.stopPropagation(); setFormModal(sup) }}
                    aria-label="Modifier"
                  >
                    <Edit2 size={13} /> Modifier
                  </button>
                  <button
                    className={s.iconBtnDanger}
                    onClick={e => handleDelete(sup.id, e)}
                    aria-label="Supprimer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
