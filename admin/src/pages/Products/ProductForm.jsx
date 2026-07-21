import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Upload, X, Star, AlertTriangle, Check, Trash2,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  getProductById, createProduct, updateProduct,
  uploadProductImage, deleteProductImage, setPrimaryImage,
} from '../../services/products.service.js'
import { getCategories } from '../../services/categories.service.js'
import { getSuppliers } from '../../services/suppliers.service.js'
import { getTaxRates } from '../../services/settings.service.js'
import { useToast } from '../../contexts/ToastContext.jsx'
import s from './ProductForm.module.css'

const schema = z.object({
  name:             z.string().min(1, 'Nom requis'),
  sku:              z.string().min(1, 'SKU requis'),
  priceChf:         z.coerce.number().positive('Prix invalide'),
  stock:            z.coerce.number().int().min(0, 'Stock invalide'),
  weightKg:         z.coerce.number().min(0).optional(),
  lengthCm:         z.coerce.number().min(0).optional(),
  widthCm:          z.coerce.number().min(0).optional(),
  comparePriceChf:  z.coerce.number().min(0).optional(),
  categoryId:       z.coerce.number().int().positive('Catégorie requise'),
  supplierId:       z.coerce.number().int().min(0).optional(),
  taxRateId:        z.coerce.number().int().positive('Taxe requise'),
  isFeatured:       z.boolean().optional(),
  isMadeToOrder:    z.boolean().optional(),
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
  const inputRef                   = useRef(null)
  const [dragging,  setDragging]   = useState(false)
  const [uploading, setUploading]  = useState(false)
  const [settingId, setSettingId]  = useState(null)
  const [error,     setError]      = useState('')

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

// ── Page création/édition produit ──────────────────────────────────────────
export default function ProductForm() {
  const navigate                    = useNavigate()
  const { id }                      = useParams()
  const toast                       = useToast()
  const isEdit                      = !!id

  const [product,    setProduct]    = useState(null)
  const [loading,    setLoading]    = useState(isEdit)
  const [categories, setCategories] = useState([])
  const [suppliers,  setSuppliers]  = useState([])
  const [taxRates,   setTaxRates]   = useState([])
  const [images,     setImages]     = useState([])
  const [imgLoading, setImgLoading] = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [apiError,   setApiError]   = useState('')

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { isActive: true, isFeatured: false, isMadeToOrder: false, badge: '', stock: 0 },
  })

  const selectedSupplierId = watch('supplierId')
  const isMadeToOrderChecked = watch('isMadeToOrder')
  const selectedSupplier = suppliers.find(sup => String(sup.id) === String(selectedSupplierId))
  const supplierDelay = selectedSupplier?.made_to_order_delay_min_weeks && selectedSupplier?.made_to_order_delay_max_weeks
    ? `${selectedSupplier.made_to_order_delay_min_weeks} à ${selectedSupplier.made_to_order_delay_max_weeks} semaines`
    : null

  /* Charge les listes de référence */
  useEffect(() => {
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

    getSuppliers({ limit: 100 }).then(({ data }) => setSuppliers(data)).catch(() => {})

    getTaxRates().then(setTaxRates).catch(() => {
      setTaxRates([
        { id: 1, name: 'Taux normal',   rate: 8.1, is_default: 1 },
        { id: 2, name: 'Taux réduit',   rate: 2.6 },
        { id: 3, name: 'Taux hôtelier', rate: 3.8 },
      ])
    })
  }, [])

  /* Taux TVA fixé automatiquement (toujours 8.1% pour ce catalogue) — appliqué
     uniquement en création, l'édition reprend le taux existant du produit via reset() */
  useEffect(() => {
    if (isEdit || taxRates.length === 0) return
    const defaultTax = taxRates.find(t => t.is_default) ?? taxRates[0]
    if (defaultTax) setValue('taxRateId', defaultTax.id)
  }, [isEdit, taxRates, setValue])

  /* Charge le produit en mode édition */
  useEffect(() => {
    if (!isEdit) return
    setLoading(true)
    setImgLoading(true)
    getProductById(Number(id))
      .then(res => {
        setProduct(res)
        reset({
          name:            res.name ?? '',
          sku:             res.sku ?? '',
          priceChf:        res.price_chf ?? '',
          comparePriceChf: res.compare_price_chf ?? '',
          stock:           res.stock ?? 0,
          weightKg:        res.weight_kg ?? '',
          lengthCm:        res.length_cm ?? '',
          widthCm:         res.width_cm ?? '',
          categoryId:      res.category_id ?? '',
          supplierId:      res.supplier_id ?? '',
          taxRateId:       res.tax_rate_id ?? '',
          isFeatured:      !!res.is_featured,
          isMadeToOrder:   !!res.is_made_to_order,
          isActive:        !!res.is_active,
          badge:           res.badge ?? '',
          description:     res.description_fr ?? '',
          nameDe:          res.translations?.de?.name ?? '',
          descriptionDe:   res.translations?.de?.description ?? '',
          nameEn:          res.translations?.en?.name ?? '',
          descriptionEn:   res.translations?.en?.description ?? '',
        })
        const imgs = (res?.images ?? []).map(img => ({ ...img, isPrimary: !!img.is_primary }))
        setImages(imgs)
      })
      .catch(() => setApiError('Impossible de charger ce produit.'))
      .finally(() => { setLoading(false); setImgLoading(false) })
  }, [isEdit, id, reset])

  const goBack = () => navigate('/produits')

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
        lengthCm:        data.lengthCm ? Number(data.lengthCm) : null,
        widthCm:         data.widthCm ? Number(data.widthCm) : null,
        isFeatured:      !!data.isFeatured,
        isMadeToOrder:   !!data.isMadeToOrder,
        isActive:        !!data.isActive,
        badge:           data.badge || null,
        translations: {
          fr: { name: data.name, description: data.description ?? '' },
          ...(data.nameDe ? { de: { name: data.nameDe, description: data.descriptionDe ?? '' } } : {}),
          ...(data.nameEn ? { en: { name: data.nameEn, description: data.descriptionEn ?? '' } } : {}),
        },
      }

      if (isEdit) {
        await updateProduct(Number(id), payload)
      } else {
        await createProduct(payload)
      }
      setSaved(true)
      toast.success(isEdit ? 'Produit mis à jour.' : 'Produit créé.')
      setTimeout(goBack, 500)
    } catch (err) {
      setApiError(err.response?.data?.message ?? 'Une erreur est survenue.')
    }
  }

  if (loading) {
    return (
      <div className={s.page}>
        <p className={s.loadingText}>Chargement du produit…</p>
      </div>
    )
  }

  return (
    <div className={s.page}>
      <div className={s.body}>
        {apiError && (
          <div className={s.apiError}><AlertTriangle size={13} /> {apiError}</div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} id="product-form" className={s.formSections}>
          {/* Informations générales */}
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Informations générales</h2>
            <div className={s.formGrid}>
              <div className={s.field}>
                <label className={s.label}>Fournisseur</label>
                <select className={s.input} {...register('supplierId')}>
                  <option value="">— Aucun —</option>
                  {suppliers.map(sup => (
                    <option key={sup.id} value={sup.id}>{sup.name}</option>
                  ))}
                </select>
              </div>

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

              <div className={s.field}>
                <label className={s.label}>Nom du produit *</label>
                <input className={`${s.input} ${errors.name ? s.inputError : ''}`} {...register('name')} />
                {errors.name && <span className={s.err}>{errors.name.message}</span>}
              </div>

              <div className={s.field}>
                <label className={s.label}>SKU *</label>
                <input className={`${s.input} ${errors.sku ? s.inputError : ''}`} {...register('sku')} />
                {errors.sku && <span className={s.err}>{errors.sku.message}</span>}
              </div>

              <div className={`${s.field} ${s.fieldFull}`}>
                <label className={s.label}>Description (FR)</label>
                <textarea
                  className={`${s.input} ${s.textarea}`}
                  rows={4}
                  placeholder="Description du produit en français…"
                  {...register('description')}
                />
              </div>

              <div className={s.field}>
                <label className={s.label}>Badge</label>
                <select className={s.input} {...register('badge')}>
                  <option value="">— Aucun badge —</option>
                  <option value="nouveaute">Nouveauté</option>
                  <option value="promo">Promo</option>
                  <option value="coup_de_coeur">Coup de cœur</option>
                  <option value="exclusif">Exclusif</option>
                </select>
              </div>

              <div className={s.field}>
                <label className={s.label}>Poids (kg)</label>
                <input type="number" step="0.001" min="0" className={s.input} placeholder="ex: 0.150" {...register('weightKg')} />
              </div>

              <div className={s.field}>
                <label className={s.label}>Longueur (cm)</label>
                <input type="number" step="0.1" min="0" className={s.input} placeholder="ex: 30" {...register('lengthCm')} />
              </div>

              <div className={s.field}>
                <label className={s.label}>Largeur (cm)</label>
                <input type="number" step="0.1" min="0" className={s.input} placeholder="ex: 20" {...register('widthCm')} />
              </div>

              <div className={`${s.field} ${s.checkGroupInline}`}>
                <label className={s.checkRow}>
                  <input type="checkbox" {...register('isActive')} />
                  <span>Produit actif (visible en boutique)</span>
                </label>
                <label className={s.checkRow}>
                  <input type="checkbox" {...register('isFeatured')} />
                  <span>Mis en avant (page d'accueil)</span>
                </label>
                <label className={s.checkRow}>
                  <input type="checkbox" {...register('isMadeToOrder')} />
                  <span>
                    Sur commande — commandable sans stock
                    {supplierDelay && ` (délai ${supplierDelay})`}
                  </span>
                </label>
              </div>

              {isMadeToOrderChecked && !supplierDelay && (
                <p className={`${s.supplierDelayWarning} ${s.fieldFull}`}>
                  <AlertTriangle size={12} />
                  {selectedSupplier
                    ? `Le fournisseur « ${selectedSupplier.name} » n'a pas de délai configuré — le texte générique « 3 à 4 semaines » sera affiché en boutique. Configurez son délai dans l'onglet Fournisseurs.`
                    : "Aucun fournisseur sélectionné — le texte générique « 3 à 4 semaines » sera affiché en boutique. Choisissez un fournisseur avec un délai configuré."}
                </p>
              )}
            </div>
          </section>

          {/* Prix & stock */}
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Prix & stock</h2>
            <div className={s.formGrid}>
              <div className={s.field}>
                <label className={s.label}>Prix CHF *</label>
                <input type="number" step="0.05" min="0" className={`${s.input} ${errors.priceChf ? s.inputError : ''}`} {...register('priceChf')} />
                {errors.priceChf && <span className={s.err}>{errors.priceChf.message}</span>}
              </div>

              <div className={s.field}>
                <label className={s.label}>Prix barré CHF</label>
                <input type="number" step="0.05" min="0" className={s.input} placeholder="Optionnel" {...register('comparePriceChf')} />
              </div>

              <div className={s.field}>
                <label className={s.label}>Stock *</label>
                <input type="number" min="0" className={`${s.input} ${errors.stock ? s.inputError : ''}`} {...register('stock')} />
                {errors.stock && <span className={s.err}>{errors.stock.message}</span>}
              </div>
            </div>
          </section>

          {/* Traductions */}
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Traductions</h2>
            <div className={s.formGrid}>
              <div className={s.field}>
                <label className={s.label}>Nom (DE)</label>
                <input className={s.input} placeholder="Produktname auf Deutsch…" {...register('nameDe')} />
              </div>
              <div className={s.field}>
                <label className={s.label}>Nom (EN)</label>
                <input className={s.input} placeholder="Product name in English…" {...register('nameEn')} />
              </div>
              <div className={s.field}>
                <label className={s.label}>Description (DE)</label>
                <textarea className={`${s.input} ${s.textarea}`} rows={3} placeholder="Beschreibung auf Deutsch…" {...register('descriptionDe')} />
              </div>
              <div className={s.field}>
                <label className={s.label}>Description (EN)</label>
                <textarea className={`${s.input} ${s.textarea}`} rows={3} placeholder="Description in English…" {...register('descriptionEn')} />
              </div>
            </div>
          </section>
        </form>

        {/* Images */}
        <section className={s.section}>
          <h2 className={s.sectionTitle}>Images du produit</h2>
          {isEdit ? (
            imgLoading
              ? <p className={s.imgLoadingText}>Chargement des images…</p>
              : <ImageDropZone productId={Number(id)} images={images} onImagesChange={setImages} />
          ) : (
            <p className={s.imgNote}>
              Créez d'abord le produit, puis ajoutez les images depuis le bouton Modifier.
            </p>
          )}
        </section>
      </div>

      <div className={s.actionBar}>
        <div className={s.actionBarInner}>
          <div className={s.actionBarLeft}>
            <button className={s.backBtn} onClick={goBack} aria-label="Retour à la liste">
              <ArrowLeft size={18} />
            </button>
            <h1 className={s.headerTitle}>
              {isEdit ? `Modifier — ${product?.name ?? ''}` : 'Nouveau produit'}
            </h1>
          </div>
          <div className={s.actionBarRight}>
            <button type="button" className={s.btnCancel} onClick={goBack}>Annuler</button>
            <button type="submit" form="product-form" className={s.btnSaveLarge} disabled={isSubmitting || saved}>
              {saved
                ? <><Check size={16} /> Enregistré</>
                : isSubmitting ? 'Enregistrement…' : isEdit ? 'Enregistrer les modifications' : 'Créer le produit'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
