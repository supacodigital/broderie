import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useDebounceSearch } from '../../hooks/useDebounceSearch.js'
import { useSearchParams } from 'react-router-dom'
import {
  Plus, Search, Edit2, Trash2,
  ImageOff, Upload, X, Star, AlertTriangle, Check,
  SlidersHorizontal, RotateCcw, Layout, Eye, ChevronDown,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  getProducts, getProductById, createProduct, updateProduct,
  deleteProduct, uploadProductImage, deleteProductImage, setPrimaryImage,
} from '../../services/products.service.js'
import { getCategories } from '../../services/categories.service.js'
import { getSuppliers } from '../../services/suppliers.service.js'
import { getTaxRates } from '../../services/settings.service.js'
import { formatCHF } from '../../utils/chf.js'
import SortIcon from '../../components/ui/SortIcon/SortIcon.jsx'
import Pagination from '../../components/ui/Pagination/Pagination.jsx'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import SkeletonTable from '../../components/ui/SkeletonTable/SkeletonTable.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog/ConfirmDialog.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import s from './Products.module.css'

const LIMIT = 20
const FEATURED_MAX = 5

// ── Aperçu bento ──────────────────────────────────────────────────────────
function BentoPreview({ products, onClose }) {
  return (
    <div className={s.previewOverlay} onClick={onClose}>
      <div className={s.previewModal} onClick={e => e.stopPropagation()}>
        <div className={s.previewHead}>
          <span className={s.previewTitle}>Aperçu — Vitrine home</span>
          <button className={s.previewClose} onClick={onClose} aria-label="Fermer"><X size={15} /></button>
        </div>
        <p className={s.previewSub}>Tel qu'il s'affichera sur la page d'accueil</p>
        <div className={s.previewBento}>
          {Array.from({ length: FEATURED_MAX }).map((_, i) => {
            const p = products[i]
            const isFirst = i === 0
            return (
              <div key={p?.id ?? `empty-${i}`} className={`${s.previewSlot} ${isFirst ? s.previewSlotLarge : ''}`}>
                <div className={s.previewImg}>
                  {p?.image_url
                    ? <img src={p.image_url} alt={p.name} />
                    : <ImageOff size={20} />
                  }
                </div>
                {p ? (
                  <div className={s.previewInfo}>
                    <p className={s.previewName}>{p.name}</p>
                    <p className={s.previewPrice}>CHF {Number(p.price_chf).toFixed(2)}</p>
                  </div>
                ) : (
                  <p className={s.previewEmpty}>Slot vide</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Recherche inline pour slot vide ──────────────────────────────────────
function SlotSearch({ onAdd, onClose }) {
  const [q, setQ]           = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef              = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    const timer = setTimeout(() => {
      getProducts({ q, limit: 6, is_active: 'true' })
        .then(res => setResults(res.data ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [q])

  return (
    <div className={s.slotSearch}>
      <div className={s.slotSearchInput}>
        <Search size={12} className={s.slotSearchIcon} />
        <input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Rechercher un produit…"
          className={s.slotSearchField}
        />
        <button onClick={onClose} className={s.slotSearchClose}><X size={12} /></button>
      </div>
      {loading && <p className={s.slotSearchLoading}>Recherche…</p>}
      {!loading && results.length > 0 && (
        <ul className={s.slotSearchResults}>
          {results.map(p => (
            <li key={p.id}>
              <button className={s.slotSearchResult} onClick={() => onAdd(p)}>
                <div className={s.slotSearchThumb}>
                  {p.image_url
                    ? <img src={p.image_url} alt={p.name} />
                    : <ImageOff size={10} />
                  }
                </div>
                <span className={s.slotSearchName}>{p.name}</span>
                <span className={s.slotSearchPrice}>CHF {Number(p.price_chf).toFixed(2)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && q.length >= 2 && results.length === 0 && (
        <p className={s.slotSearchEmpty}>Aucun résultat</p>
      )}
    </div>
  )
}

// ── Bande vitrine home ─────────────────────────────────────────────────────
function FeaturedSlots({ featuredProducts, onEdit, onRemove, onAdd }) {
  const count                           = featuredProducts.length
  const [open, setOpen]                 = useState(true)
  const [preview, setPreview]           = useState(false)
  const [activeSearch, setActiveSearch] = useState(null)

  return (
    <>
      {preview && <BentoPreview products={featuredProducts} onClose={() => setPreview(false)} />}
      <div className={s.featuredBar}>
        <button className={s.featuredBarHead} onClick={() => setOpen(v => !v)} aria-expanded={open}>
          <Layout size={14} className={s.featuredBarIcon} />
          <span className={s.featuredBarTitle}>Vitrine home — bento grid</span>
          <span className={`${s.featuredBarCount} ${count >= FEATURED_MAX ? s.featuredBarCountFull : ''}`}>
            {count} / {FEATURED_MAX}
          </span>
          {count > FEATURED_MAX && (
            <span className={s.featuredBarWarn}>
              <AlertTriangle size={12} /> {count - FEATURED_MAX} de trop
            </span>
          )}
          <ChevronDown size={15} className={`${s.featuredBarChevron} ${open ? s.featuredBarChevronOpen : ''}`} />
        </button>

        {open && (
          <>
          <div className={s.featuredBarActions}>
            <button className={s.previewBtn} onClick={e => { e.stopPropagation(); setPreview(true) }}>
              <Eye size={13} /> Aperçu
            </button>
          </div>
          <div className={s.featuredSlots}>
          {Array.from({ length: FEATURED_MAX }).map((_, i) => {
            const product = featuredProducts[i]
            const isFirst = i === 0

            if (product) {
              return (
                <div
                  key={product.id}
                  className={`${s.featuredSlot} ${isFirst ? s.featuredSlotLarge : ''}`}
                >
                  {isFirst && <span className={s.featuredSlotLabel}>Grande carte</span>}
                  <div className={s.featuredSlotImg}>
                    {product.image_url
                      ? <img src={product.image_url} alt={product.name} />
                      : <ImageOff size={16} />
                    }
                  </div>
                  <p className={s.featuredSlotName}>{product.name}</p>
                  <p className={s.featuredSlotPrice}>{product.price_chf ? `CHF ${Number(product.price_chf).toFixed(2)}` : ''}</p>
                  <div className={s.featuredSlotActions}>
                    <button className={s.featuredSlotEdit} onClick={() => onEdit(product)} title="Modifier">
                      <Edit2 size={11} />
                    </button>
                    <button className={s.featuredSlotRemove} onClick={() => onRemove(product)} title="Retirer de la home">
                      <X size={11} />
                    </button>
                  </div>
                </div>
              )
            }

            /* Slot vide */
            return (
              <div
                key={`empty-${i}`}
                className={`${s.featuredSlot} ${s.featuredSlotEmpty} ${isFirst ? s.featuredSlotLarge : ''}`}
              >
                {isFirst && <span className={s.featuredSlotLabel}>Grande carte</span>}
                {activeSearch === i ? (
                  <SlotSearch
                    onAdd={(p) => { onAdd(p); setActiveSearch(null) }}
                    onClose={() => setActiveSearch(null)}
                  />
                ) : (
                  <button className={s.featuredSlotAddBtn} onClick={() => setActiveSearch(i)}>
                    <Plus size={16} />
                    <span>Ajouter</span>
                  </button>
                )}
              </div>
            )
          })}
          </div>
          <p className={s.featuredBarHint}>Le slot 1 s'affiche en grande carte · Modifiez un produit pour le placer en tête</p>
          </>
        )}
      </div>
    </>
  )
}

const schema = z.object({
  name:             z.string().min(1, 'Nom requis'),
  sku:              z.string().min(1, 'SKU requis'),
  priceChf:         z.coerce.number().positive('Prix invalide'),
  stock:            z.coerce.number().int().min(0, 'Stock invalide'),
  weightKg:         z.coerce.number().min(0).optional(),
  comparePriceChf:  z.coerce.number().min(0).optional(),
  categoryId:       z.coerce.number().int().positive('Catégorie requise'),
  supplierId:       z.coerce.number().int().min(0).optional(),
  taxRateId:        z.coerce.number().int().positive('Taxe requise'),
  isFeatured:       z.boolean().optional(),
  isActive:         z.boolean().optional(),
  badge:            z.string().optional(),
  description:      z.string().optional(),
  nameDe:           z.string().optional(),
  descriptionDe:    z.string().optional(),
  nameEn:           z.string().optional(),
  descriptionEn:    z.string().optional(),
})

// ── Zone de drop d'images ──────────────────────────────────────────────────
function ImageDropZone({ productId, images, onImagesChange }) {
  const inputRef                       = useRef(null)
  const [dragging,    setDragging]     = useState(false)
  const [uploading,   setUploading]    = useState(false)
  const [settingId,   setSettingId]    = useState(null)
  const [error,       setError]        = useState('')

  const upload = async (files) => {
    setError('')
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    const toUpload = Array.from(files).filter(f => validTypes.includes(f.type))
    if (!toUpload.length) { setError('Formats acceptés : JPG, PNG, WebP'); return }
    if (toUpload.some(f => f.size > 5 * 1024 * 1024)) { setError('Taille max : 5 MB par image'); return }

    setUploading(true)
    const results = []
    for (const file of toUpload) {
      try {
        const fd = new FormData()
        fd.append('image', file)
        fd.append('isPrimary', images.length === 0 && results.length === 0 ? 'true' : 'false')
        fd.append('alt', file.name.replace(/\.[^.]+$/, ''))
        const res = await uploadProductImage(productId, fd)
        const img = res
        results.push({ ...img, isPrimary: !!img.is_primary })
      } catch {
        setError("Erreur lors de l'upload d'une image")
      }
    }
    setUploading(false)
    if (results.length) onImagesChange([...images, ...results])
  }

  const handleDrop = (e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files) }

  const handleDelete = async (imgId) => {
    try {
      await deleteProductImage(productId, imgId)
      const wasPrimary = images.find(i => i.id === imgId)?.isPrimary
      const remaining  = images.filter(i => i.id !== imgId)
      /* Si l'image supprimée était principale, promouvoir la première restante */
      if (wasPrimary && remaining.length > 0) {
        try {
          await setPrimaryImage(productId, remaining[0].id)
          remaining[0] = { ...remaining[0], isPrimary: true }
        } catch { /* non bloquant */ }
      }
      onImagesChange(remaining)
    } catch { setError('Erreur lors de la suppression') }
  }

  const handleSetPrimary = async (imgId) => {
    if (settingId) return
    setSettingId(imgId)
    setError('')
    try {
      await setPrimaryImage(productId, imgId)
      onImagesChange(images.map(i => ({ ...i, isPrimary: i.id === imgId })))
    } catch {
      setError("Erreur lors du changement d'image principale")
    } finally {
      setSettingId(null)
    }
  }

  return (
    <div className={s.imageSection}>
      <p className={s.imageSectionTitle}>Images du produit</p>

      {images.length > 0 && (
        <div className={s.imageGrid}>
          {images.map((img) => (
            <div key={img.id} className={`${s.imageThumb} ${img.isPrimary ? s.imagePrimary : ''}`}>
              <img
                src={img.url_thumbnail ?? img.urls?.thumbnail ?? img.url}
                alt={img.alt ?? ''}
                className={s.imageThumbImg}
              />
              {img.isPrimary && (
                <span className={s.primaryBadge}><Star size={9} fill="currentColor" /> Principale</span>
              )}
              <div className={s.imageThumbActions}>
                {!img.isPrimary && (
                  <button
                    type="button"
                    className={s.imageActionBtn}
                    onClick={() => handleSetPrimary(img.id)}
                    disabled={!!settingId}
                    title="Définir comme principale"
                  >
                    {settingId === img.id
                      ? <span className={s.spinnerSm} />
                      : <Star size={11} />
                    }
                  </button>
                )}
                <button
                  type="button"
                  className={`${s.imageActionBtn} ${s.imageActionDanger}`}
                  onClick={() => handleDelete(img.id)}
                  disabled={!!settingId}
                  title="Supprimer"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        className={`${s.dropZone} ${dragging ? s.dropZoneActive : ''} ${uploading ? s.dropZoneUploading : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={(e) => { if (e.target === inputRef.current) return; if (!uploading) inputRef.current?.click() }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        aria-label="Zone de dépôt d'images"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className={s.fileInput}
          onChange={(e) => { upload(e.target.files); e.target.value = '' }}
        />
        {uploading ? (
          <div className={s.dropZoneContent}>
            <div className={s.spinner} />
            <p className={s.dropZoneText}>Conversion WebP en cours…</p>
          </div>
        ) : (
          <div className={s.dropZoneContent}>
            <Upload size={22} className={s.dropZoneIcon} />
            <p className={s.dropZoneText}>
              Glissez-déposez ici<br />
              <span>ou cliquez pour parcourir</span>
            </p>
            <p className={s.dropZoneHint}>JPG, PNG, WebP · Max 5 MB · Converti en WebP</p>
          </div>
        )}
      </div>

      {error && <p className={s.imageError}><AlertTriangle size={12} /> {error}</p>}
    </div>
  )
}

// ── Modale création/édition produit ───────────────────────────────────────
function ProductModal({ product, categories, suppliers, taxRates, onClose, onSaved }) {
  const isEdit = !!product
  const [images,     setImages]     = useState([])
  const [imgLoading, setImgLoading] = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [apiError,   setApiError]   = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: isEdit ? {
      name:            product.name ?? '',
      sku:             product.sku ?? '',
      priceChf:        product.price_chf ?? '',
      comparePriceChf: product.compare_price_chf ?? '',
      stock:           product.stock ?? 0,
      weightKg:        product.weight_kg ?? '',
      categoryId:      product.category_id ?? '',
      supplierId:      product.supplier_id ?? '',
      taxRateId:       product.tax_rate_id ?? '',
      isFeatured:      !!product.is_featured,
      isActive:        !!product.is_active,
      badge:           product.badge ?? '',
      description:     product.description_fr ?? '',
      nameDe:          product.translations?.de?.name ?? '',
      descriptionDe:   product.translations?.de?.description ?? '',
      nameEn:          product.translations?.en?.name ?? '',
      descriptionEn:   product.translations?.en?.description ?? '',
    } : { isActive: true, isFeatured: false, badge: '', stock: 0 },
  })

  useEffect(() => {
    if (!isEdit) return
    setImgLoading(true)
    getProductById(product.id)
      .then(res => {
        /* Normalise is_primary (DB snake_case) → isPrimary (camelCase) */
        const imgs = (res?.images ?? []).map(img => ({
          ...img,
          isPrimary: !!img.is_primary,
        }))
        setImages(imgs)
      })
      .catch(() => {})
      .finally(() => setImgLoading(false))
  }, [isEdit, product?.id])

  const onSubmit = async (data) => {
    setApiError('')
    try {
      const slugBase = data.name
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/^-+|-+$/g, '')
      const slug = slugBase || `produit-${Date.now()}`

      const payload = {
        categoryId:      Number(data.categoryId),
        supplierId:      data.supplierId ? Number(data.supplierId) : null,
        taxRateId:       Number(data.taxRateId),
        slug:            isEdit ? undefined : slug,
        priceChf:        Number(data.priceChf),
        comparePriceChf: data.comparePriceChf ? Number(data.comparePriceChf) : null,
        sku:             data.sku,
        stock:           Number(data.stock),
        weightKg:        data.weightKg ? Number(data.weightKg) : null,
        isFeatured:      !!data.isFeatured,
        isActive:        !!data.isActive,
        badge:           data.badge || null,
        translations: {
          fr: { name: data.name, description: data.description ?? '' },
          ...(data.nameDe ? { de: { name: data.nameDe, description: data.descriptionDe ?? '' } } : {}),
          ...(data.nameEn ? { en: { name: data.nameEn, description: data.descriptionEn ?? '' } } : {}),
        },
      }

      if (isEdit) {
        await updateProduct(product.id, payload)
      } else {
        await createProduct(payload)
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
            {isEdit ? `Modifier — ${product.name}` : 'Nouveau produit'}
          </h2>
          <button className={s.closeBtn} onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>

        <div className={s.modalBody}>
          {apiError && (
            <div className={s.apiError}><AlertTriangle size={13} /> {apiError}</div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} id="product-form">
            <div className={s.formGrid}>
              {/* Nom */}
              <div className={`${s.field} ${s.fieldFull}`}>
                <label className={s.label}>Nom du produit *</label>
                <input className={`${s.input} ${errors.name ? s.inputError : ''}`} {...register('name')} />
                {errors.name && <span className={s.err}>{errors.name.message}</span>}
              </div>

              {/* SKU */}
              <div className={s.field}>
                <label className={s.label}>SKU *</label>
                <input className={`${s.input} ${errors.sku ? s.inputError : ''}`} {...register('sku')} />
                {errors.sku && <span className={s.err}>{errors.sku.message}</span>}
              </div>

              {/* Prix CHF */}
              <div className={s.field}>
                <label className={s.label}>Prix CHF *</label>
                <input type="number" step="0.05" min="0" className={`${s.input} ${errors.priceChf ? s.inputError : ''}`} {...register('priceChf')} />
                {errors.priceChf && <span className={s.err}>{errors.priceChf.message}</span>}
              </div>

              {/* Prix barré */}
              <div className={s.field}>
                <label className={s.label}>Prix barré CHF</label>
                <input type="number" step="0.05" min="0" className={s.input} placeholder="Optionnel" {...register('comparePriceChf')} />
              </div>

              {/* Stock */}
              <div className={s.field}>
                <label className={s.label}>Stock *</label>
                <input type="number" min="0" className={`${s.input} ${errors.stock ? s.inputError : ''}`} {...register('stock')} />
                {errors.stock && <span className={s.err}>{errors.stock.message}</span>}
              </div>

              {/* Poids */}
              <div className={s.field}>
                <label className={s.label}>Poids (kg)</label>
                <input type="number" step="0.001" min="0" className={s.input} placeholder="ex: 0.150" {...register('weightKg')} />
              </div>

              {/* Catégorie */}
              <div className={s.field}>
                <label className={s.label}>Catégorie *</label>
                <select className={`${s.input} ${errors.categoryId ? s.inputError : ''}`} {...register('categoryId')}>
                  <option value="">— Choisir —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {errors.categoryId && <span className={s.err}>{errors.categoryId.message}</span>}
              </div>

              {/* Fournisseur */}
              <div className={s.field}>
                <label className={s.label}>Fournisseur</label>
                <select className={s.input} {...register('supplierId')}>
                  <option value="">— Aucun —</option>
                  {suppliers.map(sup => (
                    <option key={sup.id} value={sup.id}>{sup.name}</option>
                  ))}
                </select>
              </div>

              {/* TVA */}
              <div className={s.field}>
                <label className={s.label}>Taux TVA *</label>
                <select className={`${s.input} ${errors.taxRateId ? s.inputError : ''}`} {...register('taxRateId')}>
                  <option value="">— Choisir —</option>
                  {taxRates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.rate}%)</option>
                  ))}
                </select>
                {errors.taxRateId && <span className={s.err}>{errors.taxRateId.message}</span>}
              </div>

              {/* Description FR */}
              <div className={`${s.field} ${s.fieldFull}`}>
                <label className={s.label}>Description (FR)</label>
                <textarea
                  className={`${s.input} ${s.textarea}`}
                  rows={3}
                  placeholder="Description du produit en français…"
                  {...register('description')}
                />
              </div>

              {/* Traduction DE */}
              <div className={s.field}>
                <label className={s.label}>Nom (DE)</label>
                <input className={s.input} placeholder="Produktname auf Deutsch…" {...register('nameDe')} />
              </div>
              <div className={s.field}>
                <label className={s.label}>Description (DE)</label>
                <textarea className={`${s.input} ${s.textarea}`} rows={2} placeholder="Beschreibung auf Deutsch…" {...register('descriptionDe')} />
              </div>

              {/* Traduction EN */}
              <div className={s.field}>
                <label className={s.label}>Nom (EN)</label>
                <input className={s.input} placeholder="Product name in English…" {...register('nameEn')} />
              </div>
              <div className={s.field}>
                <label className={s.label}>Description (EN)</label>
                <textarea className={`${s.input} ${s.textarea}`} rows={2} placeholder="Description in English…" {...register('descriptionEn')} />
              </div>
            </div>

            {/* Badge promotionnel */}
            <div className={s.field} style={{ marginBottom: 16 }}>
              <label className={s.label}>Badge</label>
              <select className={s.input} {...register('badge')}>
                <option value="">— Aucun badge —</option>
                <option value="nouveaute">Nouveauté</option>
                <option value="promo">Promo</option>
                <option value="coup_de_coeur">Coup de cœur</option>
                <option value="exclusif">Exclusif</option>
              </select>
            </div>

            <div className={s.checkGroup}>
              <label className={s.checkRow}>
                <input type="checkbox" {...register('isActive')} />
                <span>Produit actif (visible en boutique)</span>
              </label>
              <label className={s.checkRow}>
                <input type="checkbox" {...register('isFeatured')} />
                <span>Mis en avant (page d'accueil)</span>
              </label>
            </div>
          </form>

          {/* Upload images — seulement en mode édition */}
          {isEdit && <div className={s.divider} />}
          {isEdit && (
            imgLoading
              ? <p className={s.imgLoadingText}>Chargement des images…</p>
              : <ImageDropZone productId={product.id} images={images} onImagesChange={setImages} />
          )}
          {!isEdit && (
            <p className={s.imgNote}>
              Créez d'abord le produit, puis ajoutez les images depuis le bouton Modifier.
            </p>
          )}
        </div>

        <div className={s.modalActions}>
          <button type="button" className={s.btnCancel} onClick={onClose}>Annuler</button>
          <button type="submit" form="product-form" className={s.btnSave} disabled={isSubmitting || saved}>
            {saved
              ? <><Check size={14} /> Enregistré</>
              : isSubmitting ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer le produit'
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page principale ────────────────────────────────────────────────────────
export default function Products() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [products,    setProducts]    = useState([])
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(1)
  const { search: searchInput, debouncedSearch: search, handleSearch: handleSearchChange } = useDebounceSearch(300, () => setPage(1))
  const [sortCol,     setSortCol]     = useState('created_at')
  const [sortDir,     setSortDir]     = useState('desc')
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(false)
  const [modal,       setModal]       = useState(null)
  const [confirm,     setConfirm]     = useState(null)
  const [categories,  setCategories]  = useState([])
  const [suppliers,   setSuppliers]   = useState([])
  const [taxRates,    setTaxRates]    = useState([])
  const [showFilters, setShowFilters] = useState(false)
  /* Filtres — états primitifs pour que useEffect les détecte fiablement */
  const [filterCat,      setFilterCat]      = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterMinPrice, setFilterMinPrice] = useState('')
  const [filterMaxPrice, setFilterMaxPrice] = useState('')
  const [filterInStock,  setFilterInStock]  = useState(false)
  const [filterIsActive, setFilterIsActive] = useState('')
  const [filterFeatured, setFilterFeatured] = useState('')

  const activeFilterCount = useMemo(() => [filterCat, filterSupplier, filterMinPrice, filterMaxPrice, filterIsActive, filterFeatured].filter(v => v !== '').length + (filterInStock ? 1 : 0), [filterCat, filterSupplier, filterMinPrice, filterMaxPrice, filterInStock, filterIsActive, filterFeatured])

  const resetFilters = () => {
    setFilterCat(''); setFilterSupplier(''); setFilterMinPrice(''); setFilterMaxPrice('')
    setFilterInStock(false); setFilterIsActive(''); setFilterFeatured('')
    setPage(1)
  }

  /* Catégories parentes pour le groupe optgroup */
  const parentCats = useMemo(() => categories.filter(c => !c.parentId), [categories])
  const childrenOf = (parentId) => categories.filter(c => c.parentId === parentId)

  /* Chargement des listes de référence (catégories, fournisseurs, TVA) */
  useEffect(() => {
    /* getCategories() retourne directement [] */
    getCategories().then(list => {
      const raw = list.map(c => ({
        id:       c.id,
        parentId: c.parent_id ?? null,
        name:     c.translations?.fr?.name ?? c.slug,
      }))
      const parents  = raw.filter(c => !c.parentId)
      const children = raw.filter(c =>  c.parentId)
      const sorted = []
      for (const p of parents) {
        sorted.push(p)
        for (const ch of children.filter(c => c.parentId === p.id)) {
          sorted.push({ ...ch, name: `— ${ch.name}` })
        }
      }
      for (const ch of children.filter(c => !parents.find(p => p.id === c.parentId))) {
        sorted.push({ ...ch, name: `— ${ch.name}` })
      }
      setCategories(sorted)
    }).catch(() => {})

    /* getSuppliers() retourne { data: [], pagination: {} } */
    getSuppliers({ limit: 100 }).then(({ data }) => setSuppliers(data)).catch(() => {})

    /* getTaxRates() retourne [] */
    getTaxRates().then(setTaxRates).catch(() => {
      setTaxRates([
        { id: 1, name: 'Taux normal',   rate: 8.1 },
        { id: 2, name: 'Taux réduit',   rate: 2.6 },
        { id: 3, name: 'Taux hôtelier', rate: 3.8 },
      ])
    })
  }, [])

  const handleSort = (col) => {
    const newDir = sortCol === col ? (sortDir === 'asc' ? 'desc' : 'asc') : 'desc'
    setSortCol(col)
    setSortDir(newDir)
    setPage(1)
  }

  const [refreshTick, setRefreshTick] = useState(0)
  const load = () => setRefreshTick(t => t + 1)

  const [featuredProducts, setFeaturedProducts] = useState([])

  /* Charge les produits featured pour la bande vitrine */
  const loadFeatured = useCallback(() => {
    getProducts({ is_featured: 'true', limit: 10, sort: 'created_at', order: 'asc' })
      .then(res => setFeaturedProducts(res.data ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => { loadFeatured() }, [loadFeatured])

  /* Construit le payload complet à partir d'un produit existant pour le PATCH featured */
  const buildFeaturedPayload = useCallback(async (product, isFeatured) => {
    const full = await getProductById(product.id)
    return {
      categoryId:      full.category_id,
      supplierId:      full.supplier_id ?? null,
      taxRateId:       full.tax_rate_id,
      priceChf:        Number(full.price_chf),
      comparePriceChf: full.compare_price_chf ? Number(full.compare_price_chf) : null,
      sku:             full.sku ?? null,
      stock:           full.stock ?? 0,
      weightKg:        full.weight_kg ? Number(full.weight_kg) : null,
      isFeatured,
      isActive:        !!full.is_active,
      badge:           full.badge ?? null,
      translations: {
        fr: { name: full.name, description: full.description_fr ?? '' },
        ...(full.translations?.de?.name ? { de: { name: full.translations.de.name, description: full.translations.de.description ?? '' } } : {}),
        ...(full.translations?.en?.name ? { en: { name: full.translations.en.name, description: full.translations.en.description ?? '' } } : {}),
      },
    }
  }, [])

  const handleRemoveFeatured = useCallback(async (product) => {
    try {
      const payload = await buildFeaturedPayload(product, false)
      await updateProduct(product.id, payload)
      loadFeatured()
      load()
      toast.success(`"${product.name}" retiré de la vitrine.`)
    } catch {
      toast.error('Erreur lors de la mise à jour.')
    }
  }, [buildFeaturedPayload, loadFeatured, toast])

  const handleAddFeatured = useCallback(async (product) => {
    try {
      const payload = await buildFeaturedPayload(product, true)
      await updateProduct(product.id, payload)
      loadFeatured()
      load()
      toast.success(`"${product.name}" ajouté à la vitrine.`)
    } catch {
      toast.error('Erreur lors de la mise à jour.')
    }
  }, [buildFeaturedPayload, loadFeatured, toast])


  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setError(false)
      setLoading(true)
      try {
        const params = { page, limit: LIMIT, sort: sortCol, order: sortDir }
        if (search)            params.q           = search
        if (filterCat)         params.category_id = filterCat
        if (filterSupplier)    params.supplier_id = filterSupplier
        if (filterMinPrice)    params.min_price   = filterMinPrice
        if (filterMaxPrice)    params.max_price   = filterMaxPrice
        if (filterInStock)     params.in_stock    = 'true'
        if (filterIsActive)    params.is_active   = filterIsActive
        if (filterFeatured)    params.is_featured = filterFeatured
        const res = await getProducts(params)
        if (!cancelled) {
          setProducts(res.data ?? [])
          setTotal(res.pagination?.total ?? 0)
        }
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [page, search, filterCat, filterSupplier, filterMinPrice, filterMaxPrice, filterInStock, filterIsActive, filterFeatured, sortCol, sortDir, refreshTick])

  /* Ouvrir directement la modale si ?edit=ID dans l'URL (ex: depuis dashboard) */
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (!editId) return
    setSearchParams({}, { replace: true })
    getProductById(Number(editId))
      .then(res => { if (res) setModal(res) })
      .catch(() => {})
  }, []) // une seule fois au montage

  const handleDelete = (id) => {
    setConfirm({
      message: 'Supprimer définitivement ce produit ?',
      onConfirm: async () => {
        try {
          await deleteProduct(id)
          load()
          toast.success('Produit supprimé.')
        } catch (err) {
          toast.error(err.response?.data?.message ?? 'Erreur lors de la suppression.')
        }
      },
    })
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className={s.page}>
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
      {modal && (
        <ProductModal
          product={modal === 'new' ? null : modal}
          categories={categories}
          suppliers={suppliers}
          taxRates={taxRates}
          onClose={() => setModal(null)}
          onSaved={() => { load(); loadFeatured() }}
        />
      )}

      <div className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Produits</h1>
          <p className={s.pageSub}>{total.toLocaleString('fr-CH')} produit{total > 1 ? 's' : ''}</p>
        </div>
        <button className={s.btnPrimary} onClick={() => setModal('new')}>
          <Plus size={16} /> Nouveau produit
        </button>
      </div>

      <div className={s.toolbar}>
        <div className={s.searchWrap}>
          <Search size={14} className={s.searchIcon} />
          <input
            type="search"
            className={s.searchInput}
            placeholder="Rechercher un produit…"
            value={searchInput}
            onChange={e => handleSearchChange(e.target.value)}
          />
        </div>
        <button
          className={`${s.filterToggleBtn} ${showFilters ? s.filterToggleActive : ''}`}
          onClick={() => setShowFilters(v => !v)}
        >
          <SlidersHorizontal size={14} />
          Filtres
          {activeFilterCount > 0 && (
            <span className={s.filterBadge}>{activeFilterCount}</span>
          )}
        </button>
        {activeFilterCount > 0 && (
          <button className={s.resetBtn} onClick={resetFilters}>
            <RotateCcw size={13} /> Réinitialiser
          </button>
        )}
      </div>

      {showFilters && (
        <div className={s.filterPanel}>
          <div className={s.filterGrid}>

            {/* Catégorie avec sous-catégories */}
            <div className={s.filterField}>
              <label className={s.filterLabel}>Catégorie</label>
              <select
                className={s.filterSelect}
                value={filterCat}
                onChange={e => { setFilterCat(e.target.value); setPage(1) }}
              >
                <option value="">Toutes</option>
                {parentCats.map(p => (
                  <optgroup key={p.id} label={p.name}>
                    <option value={p.id}>{p.name} (tout)</option>
                    {childrenOf(p.id).map(ch => (
                      <option key={ch.id} value={ch.id}>&nbsp;&nbsp;{ch.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Fournisseur */}
            <div className={s.filterField}>
              <label className={s.filterLabel}>Fournisseur</label>
              <select
                className={s.filterSelect}
                value={filterSupplier}
                onChange={e => { setFilterSupplier(e.target.value); setPage(1) }}
              >
                <option value="">Tous</option>
                {suppliers.map(sup => (
                  <option key={sup.id} value={sup.id}>{sup.name}</option>
                ))}
              </select>
            </div>

            {/* Fourchette de prix */}
            <div className={s.filterField}>
              <label className={s.filterLabel}>Prix min (CHF)</label>
              <input
                type="number"
                min="0"
                step="0.05"
                className={s.filterInput}
                placeholder="0.00"
                value={filterMinPrice}
                onChange={e => { setFilterMinPrice(e.target.value); setPage(1) }}
              />
            </div>
            <div className={s.filterField}>
              <label className={s.filterLabel}>Prix max (CHF)</label>
              <input
                type="number"
                min="0"
                step="0.05"
                className={s.filterInput}
                placeholder="999.00"
                value={filterMaxPrice}
                onChange={e => { setFilterMaxPrice(e.target.value); setPage(1) }}
              />
            </div>

            {/* Statut */}
            <div className={s.filterField}>
              <label className={s.filterLabel}>Statut</label>
              <select
                className={s.filterSelect}
                value={filterIsActive}
                onChange={e => { setFilterIsActive(e.target.value); setPage(1) }}
              >
                <option value="">Tous</option>
                <option value="true">Actif</option>
                <option value="false">Inactif</option>
              </select>
            </div>

            {/* Mise en avant */}
            <div className={s.filterField}>
              <label className={s.filterLabel}>Mise en avant</label>
              <select
                className={s.filterSelect}
                value={filterFeatured}
                onChange={e => { setFilterFeatured(e.target.value); setPage(1) }}
              >
                <option value="">Tous</option>
                <option value="true">Mis en avant</option>
                <option value="false">Non</option>
              </select>
            </div>

            {/* En stock */}
            <div className={s.filterField}>
              <label className={s.filterLabel}>Stock</label>
              <label className={s.filterCheckbox}>
                <input
                  type="checkbox"
                  checked={filterInStock}
                  onChange={e => { setFilterInStock(e.target.checked); setPage(1) }}
                />
                En stock uniquement
              </label>
            </div>

          </div>

          <div className={s.filterActions}>
            <button className={s.filterClearBtn} onClick={resetFilters}>
              Tout effacer
            </button>
          </div>
        </div>
      )}

      <FeaturedSlots
        featuredProducts={featuredProducts}
        onEdit={(product) => setModal(product)}
        onRemove={handleRemoveFeatured}
        onAdd={handleAddFeatured}
      />

      {error && <ErrorBanner onRetry={load} />}

      <div className={s.card}>
        <div className={s.tableHead}>
          <span>Produit</span>
          <span>SKU</span>
          <button className={s.sortHeader} onClick={() => handleSort('price_chf')}>
            Prix <SortIcon col="price_chf" sortCol={sortCol} sortDir={sortDir} />
          </button>
          <button className={s.sortHeader} onClick={() => handleSort('stock')}>
            Stock <SortIcon col="stock" sortCol={sortCol} sortDir={sortDir} />
          </button>
          <span>Statut</span>
          <span />
        </div>

        {loading ? (
          <SkeletonTable rows={8} cols={6} />
        ) : products.length === 0 ? (
          <p className={s.empty}>Aucun produit trouvé.</p>
        ) : (
          products.map(product => (
            <div key={product.id} className={s.tableRow}>
              <div className={s.productCell}>
                <div className={s.thumb}>
                  {product.image_url
                    ? <img
                        src={product.image_url}
                        alt={product.name}
                        onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex' }}
                      />
                    : null
                  }
                  <span style={{ display: product.image_url ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                    <ImageOff size={16} />
                  </span>
                </div>
                <div>
                  <p className={s.productName}>{product.name}</p>
                  <p className={s.productMeta}>
                    {product.category_name && <span>{product.category_name}</span>}
                    {product.category_name && product.supplier_name && <span className={s.metaSep}>·</span>}
                    {product.supplier_name && <span className={s.supplierTag}>{product.supplier_name}</span>}
                  </p>
                </div>
              </div>
              <span className={s.sku}>{product.sku ?? '—'}</span>
              <span className={s.bold}>{formatCHF(product.price_chf)}</span>
              <span className={product.stock <= 5 ? s.stockLow : s.stockOk}>
                {product.stock}
                {product.stock <= 5 && product.stock > 0 && (
                  <AlertTriangle size={11} style={{ marginLeft: 4 }} />
                )}
              </span>
              <span className={s.activeBadge} data-active={String(!!product.is_active)}>
                {product.is_active ? 'Actif' : 'Inactif'}
              </span>
              <div className={s.actions}>
                <button className={s.iconBtn} onClick={() => setModal(product)} aria-label="Modifier">
                  <Edit2 size={14} />
                </button>
                <button className={s.iconBtnDanger} onClick={() => handleDelete(product.id)} aria-label="Supprimer">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  )
}
