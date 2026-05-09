import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Plus, Search, Edit2, Trash2, ChevronLeft, ChevronRight,
  ImageOff, Upload, X, Star, AlertTriangle, Check,
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
import { roundCHF } from '../../utils/chf.js'
import ConfirmDialog from '../../components/ui/ConfirmDialog/ConfirmDialog.jsx'
import s from './Products.module.css'

const LIMIT = 20

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
        const img = res.data
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
    } : { isActive: true, isFeatured: false, badge: '', stock: 0 },
  })

  useEffect(() => {
    if (!isEdit) return
    setImgLoading(true)
    getProductById(product.id)
      .then(res => {
        /* Normalise is_primary (DB snake_case) → isPrimary (camelCase) */
        const imgs = (res.data?.images ?? []).map(img => ({
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
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
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

              {/* Description */}
              <div className={`${s.field} ${s.fieldFull}`}>
                <label className={s.label}>Description (FR)</label>
                <textarea
                  className={`${s.input} ${s.textarea}`}
                  rows={3}
                  placeholder="Description du produit en français…"
                  {...register('description')}
                />
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
  const [products,   setProducts]   = useState([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [search,     setSearch]     = useState('')
  const [filterCat,  setFilterCat]  = useState('')
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(false)
  const [modal,      setModal]      = useState(null)
  const [confirm,    setConfirm]    = useState(null)
  const [deleteError,setDeleteError]= useState(null)
  const [categories, setCategories] = useState([])
  const [suppliers,  setSuppliers]  = useState([])
  const [taxRates,   setTaxRates]   = useState([])

  /* Chargement des listes de référence (catégories, fournisseurs, TVA) */
  useEffect(() => {
    Promise.all([
      getCategories(),
      getSuppliers(),
    ]).then(([catRes, supRes]) => {
      /* translations est un objet {fr, de, en} — on extrait le nom FR */
      const raw = (catRes.data.data ?? []).map(c => ({
        id:       c.id,
        parentId: c.parent_id ?? null,
        name:     c.translations?.fr?.name ?? c.slug,
      }))
      /* Tri : parents d'abord, puis enfants indentés */
      const parents  = raw.filter(c => !c.parentId)
      const children = raw.filter(c =>  c.parentId)
      const sorted = []
      for (const p of parents) {
        sorted.push(p)
        for (const ch of children.filter(c => c.parentId === p.id)) {
          sorted.push({ ...ch, name: `— ${ch.name}` })
        }
      }
      /* Ajouter les enfants orphelins éventuels en fin de liste */
      for (const ch of children.filter(c => !parents.find(p => p.id === c.parentId))) {
        sorted.push({ ...ch, name: `— ${ch.name}` })
      }
      setCategories(sorted)
      setSuppliers(supRes.data.data ?? [])
    }).catch(() => {})

    /* Taux TVA — route admin settings */
    getTaxRates().then(res => {
      if (res.data) setTaxRates(res.data)
    }).catch(() => {
      setTaxRates([
        { id: 1, name: 'Taux normal',   rate: 8.1 },
        { id: 2, name: 'Taux réduit',   rate: 2.6 },
        { id: 3, name: 'Taux hôtelier', rate: 3.8 },
      ])
    })
  }, [])

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const params = { page, limit: LIMIT, sort: 'created_at', order: 'desc' }
      if (search)    params.q = search
      if (filterCat) params.category_id = filterCat
      const res = await getProducts(params)
      setProducts(res.data ?? [])
      setTotal(res.pagination?.total ?? 0)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [page, search, filterCat])

  useEffect(() => { load() }, [load])

  const handleDelete = (id) => {
    setConfirm({
      message: 'Supprimer définitivement ce produit ?',
      onConfirm: async () => {
        setDeleteError(null)
        try {
          await deleteProduct(id)
          load()
        } catch (err) {
          setDeleteError(err.response?.data?.message ?? 'Erreur lors de la suppression.')
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
          onSaved={load}
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
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        {categories.length > 0 && (
          <select
            className={s.filter}
            value={filterCat}
            onChange={e => { setFilterCat(e.target.value); setPage(1) }}
          >
            <option value="">Toutes les catégories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className={s.errorBanner}>
          <AlertTriangle size={14} />
          Erreur de chargement. <button className={s.retryBtn} onClick={load}>Réessayer</button>
        </div>
      )}
      {deleteError && (
        <div className={s.errorBanner}>
          <AlertTriangle size={14} />
          {deleteError}
        </div>
      )}

      <div className={s.card}>
        <div className={s.tableHead}>
          <span>Produit</span>
          <span>SKU</span>
          <span>Prix</span>
          <span>Stock</span>
          <span>Statut</span>
          <span />
        </div>

        {loading ? (
          <div className={s.loadingRows}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={s.skeletonRow}>
                {Array.from({ length: 6 }).map((__, j) => <span key={j} />)}
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className={s.empty}>Aucun produit trouvé.</p>
        ) : (
          products.map(product => (
            <div key={product.id} className={s.tableRow}>
              <div className={s.productCell}>
                <div className={s.thumb}>
                  {product.image_url
                    ? <img src={product.image_url} alt={product.name} />
                    : <ImageOff size={16} />
                  }
                </div>
                <div>
                  <p className={s.productName}>{product.name}</p>
                  {product.category_name && <p className={s.productCat}>{product.category_name}</p>}
                </div>
              </div>
              <span className={s.sku}>{product.sku ?? '—'}</span>
              <span className={s.bold}>CHF {roundCHF(product.price_chf).toFixed(2)}</span>
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

      {totalPages > 1 && (
        <div className={s.pagination}>
          <button className={s.pageBtn} disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft size={16} />
          </button>
          <span className={s.pageInfo}>Page {page} / {totalPages}</span>
          <button className={s.pageBtn} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
