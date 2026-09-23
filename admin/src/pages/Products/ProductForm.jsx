import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Upload, X, Star, AlertTriangle, Check, Trash2, CalendarClock,
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
import ConfirmDialog from '../../components/ui/ConfirmDialog/ConfirmDialog.jsx'
import { roundCHF } from '../../utils/chf.js'
import PriceHistory from '../../components/PriceHistory/PriceHistory.jsx'
import s from './ProductForm.module.css'

const schema = z.object({
  name:             z.string().min(1, 'Nom requis'),
  sku:              z.string().min(1, 'SKU requis'),
  priceChf:         z.coerce.number().positive('Prix invalide'),
  stock:            z.coerce.number().int().min(0, 'Stock invalide'),
  weightKg:         z.coerce.number().min(0).optional(),
  lengthCm:         z.coerce.number().min(0).optional(),
  widthCm:          z.coerce.number().min(0).optional(),
  categoryId:       z.coerce.number().int().positive('Catégorie requise'),
  supplierId:       z.coerce.number().int().min(0).optional(),
  taxRateId:        z.coerce.number().int().positive('Taxe requise'),
  isFeatured:       z.boolean().optional(),
  isMadeToOrder:    z.boolean().optional(),
  // Vente à la coupe — trames et bandes à broder (ADM-12)
  soldByLength:     z.boolean().optional(),
  lengthStepCm:     z.coerce.number().int().min(1).max(100).optional().or(z.literal('')),
  lengthMinCm:      z.coerce.number().int().min(1).max(1000).optional().or(z.literal('')),
  isActive:         z.boolean().optional(),
  badge:            z.string().optional(),
  brand:            z.string().max(120).optional(),
  description:      z.string().optional(),
  // Fenêtre de promotion — datetime-local ('' = pas de borne de ce côté)
  promoStartsAt:    z.string().optional(),
  promoEndsAt:      z.string().optional(),
}).refine(
  (d) => !(d.promoStartsAt && d.promoEndsAt) || new Date(d.promoEndsAt) > new Date(d.promoStartsAt),
  { path: ['promoEndsAt'], message: 'La fin doit être postérieure au début.' },
)

/* MySQL DATETIME → valeur d'un <input type="datetime-local"> ('YYYY-MM-DDTHH:MM').
   La date arrive en chaîne locale du serveur ou en ISO selon le driver : on
   découpe la chaîne plutôt que de passer par Date(), qui réinterpréterait une
   chaîne sans fuseau en UTC et décalerait l'heure affichée. */
const toDateTimeLocal = (value) => {
  if (!value) return ''
  const str = String(value)
  const m = str.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  if (m) return `${m[1]}T${m[2]}`
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/* Valeur du <input datetime-local> → ISO 8601 attendu par l'API.
   La saisie est en heure locale : Date() l'interprète comme telle, toISOString
   la convertit en UTC — le serveur la reconvertira en heure locale pour MySQL. */
const fromDateTimeLocal = (value) => {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

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
  const [confirmLeave, setConfirmLeave] = useState(false)

  /* Rayons secondaires (ADM-04) — hors React Hook Form : ce sont des cases à
     cocher multiples, pas un champ de saisie, et la liste est envoyée telle
     quelle au serveur. */
  const [secondaryCategoryIds, setSecondaryCategoryIds] = useState([])

  const toggleSecondaryCategory = (categoryId) => {
    setSecondaryCategoryIds(current =>
      current.includes(categoryId)
        ? current.filter(existing => existing !== categoryId)
        : [...current, categoryId]
    )
  }

  /* Réduction (ADM-03) — le champ de prix est le PRIX CATALOGUE, celui qui figure
     sur l'étiquette avant toute promotion. La remise s'en déduit vers le BAS : saisir
     100 CHF et -25 % donne un prix barré de 100.00 et un prix payé de 75.00.

     L'inverse était appliqué jusqu'ici (le champ valait le prix payé, la remise
     remontait le prix barré à 133.35) : arithmétiquement correct, mais contraire à
     ce que la cliente saisit — d'où son constat « appliquer un rabais majore le prix ».

     En base, le modèle ne change pas : price_chf = prix payé pendant la promotion,
     compare_price_chf = prix normal barré. Seul le sens de saisie est rétabli, et
     c'est à l'enregistrement que les deux prix sont répartis dans les bonnes colonnes. */
  const [discountMode,  setDiscountMode]  = useState('none') // 'none' | 'percent' | 'fixed'
  const [discountValue, setDiscountValue] = useState('')

  const { register, handleSubmit, reset, watch, setValue, setError, formState: { errors, isSubmitting, isDirty } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { isActive: true, isFeatured: false, isMadeToOrder: false, soldByLength: false, lengthStepCm: 10, lengthMinCm: 50, badge: '', stock: 0 },
  })

  const categoryId = watch('categoryId')
  const selectedSupplierId = watch('supplierId')

  /* La catégorie principale ne peut pas figurer aussi dans les rayons
     supplémentaires : si la cliente la promeut en principale, on la retire de la
     sélection secondaire — sinon elle resterait cochée sans être visible. */
  useEffect(() => {
    if (!categoryId) return
    setSecondaryCategoryIds(current =>
      current.includes(Number(categoryId))
        ? current.filter(existing => existing !== Number(categoryId))
        : current
    )
  }, [categoryId])
  const isMadeToOrderChecked = watch('isMadeToOrder')
  const soldByLengthChecked  = watch('soldByLength')
  const lengthStep = watch('lengthStepCm')
  const lengthMin  = watch('lengthMinCm')
  const watchedPrice = watch('priceChf')

  /* Prix réellement payé pendant la promotion, dérivé du prix catalogue saisi moins
     la remise — null si aucune réduction active. Arrondi au 0.05 CHF (règle suisse).
     Une remise qui annulerait le prix ou le rendrait négatif est refusée : le prix
     payé doit rester strictement positif et inférieur au prix catalogue. */
  const promoPrice = (() => {
    if (discountMode === 'none' || !discountValue) return null
    const catalogPrice = Number(watchedPrice)
    const value = Number(discountValue)
    if (!(catalogPrice > 0) || !(value > 0)) return null
    const computed = discountMode === 'percent'
      ? catalogPrice * (1 - value / 100)
      : catalogPrice - value
    const rounded = roundCHF(computed)
    return rounded > 0 && rounded < catalogPrice ? rounded : null
  })()

  /* Aperçu de la vente à la coupe (ADM-12) — montre à l'administration ce que
     la cliente paiera réellement. Sans lui, un prix au mètre saisi par erreur
     comme prix à l'unité ne se remarque qu'une fois la commande passée.
     Un minimum qui n'est pas un multiple du pas est signalé ici : le serveur le
     refuse, autant le dire avant l'enregistrement. */
  const cutPreview = (() => {
    if (!soldByLengthChecked) return null
    const perMeter = Number(watchedPrice)
    const step = Number(lengthStep) || 10
    const min  = Number(lengthMin)  || 50
    if (!(perMeter > 0)) return null

    if (min % step !== 0) {
      return (
        <p className={s.cutWarning}>
          <AlertTriangle size={12} aria-hidden="true" />
          La longueur minimale doit être un multiple de {step} cm.
        </p>
      )
    }

    const perStep = roundCHF((perMeter * step) / 100)
    const minTotal = roundCHF((perMeter * min) / 100)
    return (
      <p className={s.cutPreview}>
        Commande minimale : <strong>{min} cm</strong> pour <strong>CHF {minTotal.toFixed(2)}</strong>.
        Chaque tranche de {step} cm coûte CHF {perStep.toFixed(2)}.
      </p>
    )
  })()

  /* État de la promotion d'après les dates saisies — retour immédiat à l'admin :
     sans ça, une promo programmée dans le futur ressemble à une promo inactive. */
  const watchedPromoStart = watch('promoStartsAt')
  const watchedPromoEnd   = watch('promoEndsAt')
  const promoStatus = (() => {
    if (discountMode === 'none' || promoPrice == null) return null
    const now   = new Date()
    const start = watchedPromoStart ? new Date(watchedPromoStart) : null
    const end   = watchedPromoEnd   ? new Date(watchedPromoEnd)   : null
    if (end && end <= now)     return { tone: 'promoStatusOff',  label: 'Promotion terminée — le produit est vendu à son prix normal.' }
    if (start && start > now)  return { tone: 'promoStatusSoon', label: `Promotion programmée — démarre le ${start.toLocaleString('fr-CH', { dateStyle: 'short', timeStyle: 'short' })}.` }
    if (end)                   return { tone: 'promoStatusOn',   label: `Promotion active jusqu'au ${end.toLocaleString('fr-CH', { dateStyle: 'short', timeStyle: 'short' })}.` }
    return { tone: 'promoStatusOn', label: 'Promotion active, sans date de fin.' }
  })()

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
      /* Arbre à N niveaux (jusqu'à 3) construit en profondeur — chaque enfant est indenté
         d'un préfixe "— " supplémentaire par niveau. Les <option> HTML ne supportant pas
         de style riche, l'indentation se fait en texte. */
      const byParent = new Map()
      for (const c of raw) {
        const key = c.parentId ?? null
        if (!byParent.has(key)) byParent.set(key, [])
        byParent.get(key).push(c)
      }
      const sorted = []
      const visit = (parentId, depth) => {
        for (const c of byParent.get(parentId) ?? []) {
          sorted.push({ ...c, name: depth > 0 ? `${'— '.repeat(depth)}${c.name}` : c.name })
          visit(c.id, depth + 1)
        }
      }
      visit(null, 0)
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

  /* Charge le produit en mode édition.
     `cancelled` protège du retour tardif : en passant vite d'une fiche à l'autre, la
     réponse de la première arrivait après le montage de la seconde et écrasait le
     formulaire — les modifications partaient alors sous le mauvais identifiant. */
  useEffect(() => {
    if (!isEdit) return
    let cancelled = false
    setLoading(true)
    setImgLoading(true)
    getProductById(Number(id))
      .then(res => {
        if (cancelled) return
        setProduct(res)

        /* Reconstitution à l'ouverture d'une fiche (ADM-03).
           Le champ de prix affiche le PRIX CATALOGUE : c'est compare_price_chf quand
           une promotion est en cours, price_chf sinon. Afficher price_chf dans tous
           les cas remonterait le prix promo dans le champ catalogue, et un simple
           enregistrement sans rien changer ferait baisser le prix à chaque passage.
           mysql2 renvoie les DECIMAL sous forme de chaînes ("119.00") : comparer avec
           > sans convertir donne un résultat lexicographique erroné (ex: "119.00" >
           "84.50" vaut false), d'où le Number() explicite avant comparaison. */
        const oldPrice = Number(res.compare_price_chf)
        const paidPrice = Number(res.price_chf)
        const hasDiscount = oldPrice > 0 && paidPrice > 0 && oldPrice > paidPrice
        if (hasDiscount) {
          /* La remise n'est reprise en pourcentage que si ce pourcentage entier
             redonne EXACTEMENT le prix payé. Sinon elle est reprise en CHF, au
             centime près. Le pourcentage arrondi (59.00 → 53.00 affiché « −10 % »)
             recalculait 53.10 au premier enregistrement : 65 % des promotions
             changeaient de prix quand la fiche était simplement ouverte puis
             enregistrée, et 560 d'entre elles augmentaient (ADM-03). */
          const percent = Math.round((1 - paidPrice / oldPrice) * 100)
          const percentIsExact = Math.abs(roundCHF(oldPrice * (1 - percent / 100)) - paidPrice) < 0.001
          if (percentIsExact) {
            setDiscountMode('percent')
            setDiscountValue(String(percent))
          } else {
            setDiscountMode('fixed')
            setDiscountValue((oldPrice - paidPrice).toFixed(2))
          }
        } else {
          setDiscountMode('none')
          setDiscountValue('')
        }
        // Prix catalogue à afficher dans le champ, selon qu'une promo est active ou non
        const catalogPriceToShow = hasDiscount ? res.compare_price_chf : res.price_chf

        reset({
          name:            res.name ?? '',
          sku:             res.sku ?? '',
          priceChf:        catalogPriceToShow ?? '',
          stock:           res.stock ?? 0,
          weightKg:        res.weight_kg ?? '',
          lengthCm:        res.length_cm ?? '',
          widthCm:         res.width_cm ?? '',
          categoryId:      res.category_id ?? '',
          // secondary_category_ids est hors formulaire — repris juste après via setSecondaryCategoryIds
          supplierId:      res.supplier_id ?? '',
          taxRateId:       res.tax_rate_id ?? '',
          isFeatured:      !!res.is_featured,
          isMadeToOrder:   !!res.is_made_to_order,
          soldByLength:    !!res.sold_by_length,
          lengthStepCm:    res.length_step_cm ?? 10,
          lengthMinCm:     res.length_min_cm  ?? 50,
          isActive:        !!res.is_active,
          badge:           res.badge ?? '',
          brand:           res.brand ?? '',
          description:     res.description_fr ?? '',
          promoStartsAt:   toDateTimeLocal(res.promo_starts_at),
          promoEndsAt:     toDateTimeLocal(res.promo_ends_at),
        })
        setSecondaryCategoryIds(res.secondary_category_ids ?? [])
        const imgs = (res?.images ?? []).map(img => ({ ...img, isPrimary: !!img.is_primary }))
        setImages(imgs)
      })
      .catch(() => { if (!cancelled) setApiError('Impossible de charger ce produit.') })
      .finally(() => { if (!cancelled) { setLoading(false); setImgLoading(false) } })
    return () => { cancelled = true }
  }, [isEdit, id, reset])

  /* Retour à la liste en remontant l'historique : la recherche, les filtres et la
     page vivent dans l'URL de la liste, et un navigate('/produits') sec les
     effaçait — on retombait sur les 15 000 références après chaque fiche ouverte.
     Repli sur l'URL nue quand il n'y a pas d'historique (arrivée par lien direct
     ou nouvel onglet), où il n'y a de toute façon rien à restaurer. */
  const leave = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/produits')
  }

  /* Quitter avec des modifications non enregistrées demande confirmation.
     Le formulaire compte une trentaine de champs : partir par erreur après avoir
     tout ressaisi n'était rattrapable d'aucune façon. `saved` neutralise la garde
     après un enregistrement réussi, sinon la redirection qui suit déclencherait
     l'alerte alors que tout est sauvegardé. */
  const goBack = () => {
    if (isDirty && !saved) {
      setConfirmLeave(true)
      return
    }
    leave()
  }

  /* Même garde pour la fermeture d'onglet ou le rechargement — là où React Router
     n'a pas la main. Le navigateur impose son propre message, on ne peut que
     déclencher l'invite. */
  useEffect(() => {
    if (!isDirty || saved) return
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty, saved])

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

      /* Répartition dans les colonnes de la base (ADM-03).
         Le champ saisi est le prix CATALOGUE. Le modèle en base, lui, est inchangé :
           - promotion active : price_chf = prix promo, compare_price_chf = prix catalogue
           - sans promotion   : price_chf = prix catalogue, compare_price_chf = null
         C'est donc ici, et seulement ici, que les deux prix prennent leur place. */
      const catalogPrice = Number(data.priceChf)
      const payload = {
        categoryId:      Number(data.categoryId),
        // Rayons supplémentaires (ADM-04) — toujours envoyés, tableau vide compris :
        // le serveur doit pouvoir enregistrer le retrait du dernier rayon.
        secondaryCategoryIds: secondaryCategoryIds,
        supplierId:      data.supplierId ? Number(data.supplierId) : null,
        taxRateId:       Number(data.taxRateId),
        slug:            isEdit ? undefined : slug,
        priceChf:        promoPrice != null ? promoPrice : catalogPrice,
        comparePriceChf: promoPrice != null ? catalogPrice : null,
        /* Bornes envoyées uniquement s'il y a une remise : sans prix barré, des
           dates seules n'auraient aucun effet (le serveur les remet à null). */
        promoStartsAt:   promoPrice != null ? fromDateTimeLocal(data.promoStartsAt) : null,
        promoEndsAt:     promoPrice != null ? fromDateTimeLocal(data.promoEndsAt)   : null,
        sku:             data.sku,
        stock:           Number(data.stock),
        weightKg:        data.weightKg ? Number(data.weightKg) : null,
        lengthCm:        data.lengthCm ? Number(data.lengthCm) : null,
        widthCm:         data.widthCm ? Number(data.widthCm) : null,
        isFeatured:      !!data.isFeatured,
        isMadeToOrder:   !!data.isMadeToOrder,
        /* Vente à la coupe (ADM-12) — les paramètres ne partent que si la case
           est cochée : un pas sur un article vendu à l'unité n'a aucun sens. */
        soldByLength:    !!data.soldByLength,
        lengthStepCm:    data.soldByLength ? (Number(data.lengthStepCm) || 10) : null,
        lengthMinCm:     data.soldByLength ? (Number(data.lengthMinCm)  || 50) : null,
        isActive:        !!data.isActive,
        badge:           data.badge || null,
        brand:           data.brand?.trim() || null,
        translations: {
          fr: { name: data.name, description: data.description ?? '' },
        },
      }

      if (isEdit) {
        await updateProduct(Number(id), payload)
      } else {
        await createProduct(payload)
      }
      setSaved(true)
      toast.success(isEdit ? 'Produit mis à jour.' : 'Produit créé.')
      /* Après une édition, on retourne à la liste telle qu'elle était (filtres et
         page conservés). Après une création, on repart sur la liste vierge triée
         par date : le nouveau produit y est en tête, alors que les filtres
         précédents pourraient très bien l'exclure et donner l'impression que
         l'enregistrement a échoué. */
      setTimeout(() => (isEdit ? goBack() : navigate('/produits')), 500)
    } catch (err) {
      /* Pas de réponse serveur — coupure réseau, timeout, backend injoignable */
      if (!err.response) {
        setApiError('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.')
        return
      }

      const { status, data } = err.response

      /* Erreurs de champ (validation 400, conflit 409) — affichées sous le champ concerné */
      const fieldErrors = data?.errors?.filter(e => e.field && e.field !== '_')
      if (fieldErrors?.length) {
        fieldErrors.forEach(({ field, message }) => {
          if (field in schema.shape) setError(field, { type: 'server', message })
        })
        /* Un conflit peut porter sur un champ hors formulaire visible (ex: slug) —
           dans ce cas le bandeau générique reste le seul moyen de le signaler */
        const unmapped = fieldErrors.filter(e => !(e.field in schema.shape))
        setApiError(unmapped.length ? unmapped.map(e => e.message).join(' ') : '')
        if (fieldErrors.length) return
      }

      if (status === 404) {
        setApiError('Ce produit n\'existe plus — il a peut-être été supprimé entre-temps.')
      } else if (status === 401 || status === 403) {
        setApiError('Votre session a expiré. Reconnectez-vous puis réessayez.')
      } else if (status >= 500) {
        setApiError('Une erreur serveur est survenue. Veuillez réessayer dans un instant.')
      } else {
        setApiError(data?.message ?? 'Une erreur est survenue.')
      }
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
      {confirmLeave && (
        <ConfirmDialog
          message="Vos modifications ne sont pas enregistrées. Quitter cette page ?"
          onConfirm={leave}
          onClose={() => setConfirmLeave(false)}
        />
      )}
      <div className={s.body}>
        {apiError && (
          <div className={s.apiError}><AlertTriangle size={13} /> {apiError}</div>
        )}

        {/* Deux colonnes : la fiche descriptive à gauche, ce qui relève de la mise
            en vente à droite (visibilité, photos). En colonne unique, la page
            faisait 1 900 px de haut alors que la moitié de l'écran restait vide,
            et les images — qu'on veut voir en modifiant le reste — se trouvaient
            tout en bas. */}
        <div className={s.layout}>
        <div className={s.mainCol}>
        <form onSubmit={handleSubmit(onSubmit)} id="product-form" className={s.formSections}>
          {/* Informations générales */}
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Informations générales</h2>
            <div className={s.formGrid}>
              <div className={s.field}>
                <label className={s.label} htmlFor="supplierId">Fournisseur</label>
                <select id="supplierId" className={s.input} {...register('supplierId')}>
                  <option value="">— Aucun —</option>
                  {suppliers.map(sup => (
                    <option key={sup.id} value={sup.id}>{sup.name}</option>
                  ))}
                </select>
              </div>

              <div className={s.field}>
                <label className={s.label} htmlFor="categoryId">Catégorie principale *</label>
                <select id="categoryId" className={`${s.input} ${errors.categoryId ? s.inputError : ''}`} {...register('categoryId')}>
                  <option value="">— Choisir —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {errors.categoryId && <span className={s.err}>{errors.categoryId.message}</span>}
                <span className={s.hint}>Rayon principal du produit — celui affiché sur sa fiche.</span>
              </div>

              {/* Rayons supplémentaires (ADM-04) — un même article peut être rangé
                  dans plusieurs rayons de la boutique. */}
              <div className={s.fieldFull}>
                <span className={s.label}>Autres rayons</span>
                <span className={s.hint}>
                  Le produit apparaîtra aussi dans ces rayons. Laissez vide s’il n’appartient qu’à sa catégorie principale.
                </span>
                <div className={s.categoryPicker}>
                  {categories
                    .filter(c => c.id !== Number(categoryId))
                    .map(c => {
                      const checked = secondaryCategoryIds.includes(c.id)
                      return (
                        <label key={c.id} className={`${s.categoryOption} ${checked ? s.categoryOptionOn : ''}`}>
                          <input
                            type="checkbox"
                            className={s.categoryCheckbox}
                            checked={checked}
                            onChange={() => toggleSecondaryCategory(c.id)}
                          />
                          <span>{c.name}</span>
                        </label>
                      )
                    })}
                </div>
              </div>

              <div className={s.field}>
                <label className={s.label} htmlFor="name">Nom du produit *</label>
                <input id="name" className={`${s.input} ${errors.name ? s.inputError : ''}`} {...register('name')} />
                {errors.name && <span className={s.err}>{errors.name.message}</span>}
              </div>

              <div className={s.field}>
                <label className={s.label} htmlFor="sku">SKU *</label>
                <input id="sku" className={`${s.input} ${errors.sku ? s.inputError : ''}`} {...register('sku')} />
                {errors.sku && <span className={s.err}>{errors.sku.message}</span>}
              </div>

              <div className={s.field}>
                <label className={s.label} htmlFor="brand">Gamme</label>
                <input
                  id="brand"
                  className={`${s.input} ${errors.brand ? s.inputError : ''}`}
                  placeholder="Ex. Permin of Copenhagen"
                  {...register('brand')}
                />
                {errors.brand && <span className={s.err}>{errors.brand.message}</span>}
              </div>

              <div className={`${s.field} ${s.fieldFull}`}>
                <label className={s.label} htmlFor="description">Description (FR)</label>
                <textarea
                  id="description"
                  className={`${s.input} ${s.textarea}`}
                  rows={4}
                  placeholder="Description du produit en français…"
                  {...register('description')}
                />
              </div>

              <div className={s.field}>
                <label className={s.label} htmlFor="badge">Badge</label>
                <select id="badge" className={s.input} {...register('badge')}>
                  <option value="">— Aucun badge —</option>
                  <option value="nouveaute">Nouveauté</option>
                  <option value="promo">Promo</option>
                  <option value="coup_de_coeur">Coup de cœur</option>
                  <option value="exclusif">Exclusif</option>
                </select>
              </div>

              <div className={s.field}>
                <label className={s.label} htmlFor="weightKg">Poids (kg)</label>
                <input id="weightKg" type="number" step="0.001" min="0" className={s.input} placeholder="ex: 0.150" {...register('weightKg')} />
              </div>

              <div className={s.field}>
                <label className={s.label} htmlFor="lengthCm">Longueur (cm)</label>
                <input id="lengthCm" type="number" step="0.1" min="0" className={s.input} placeholder="ex: 30" {...register('lengthCm')} />
              </div>

              <div className={s.field}>
                <label className={s.label} htmlFor="widthCm">Largeur (cm)</label>
                <input id="widthCm" type="number" step="0.1" min="0" className={s.input} placeholder="ex: 20" {...register('widthCm')} />
              </div>

            </div>
          </section>

          {/* Prix & stock */}
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Prix & stock</h2>
            <div className={s.formGrid}>
              <div className={s.field}>
                <label className={s.label} htmlFor="priceChf">Prix de vente (CHF) *</label>
                <input id="priceChf" type="number" step="0.05" min="0" className={`${s.input} ${errors.priceChf ? s.inputError : ''}`} {...register('priceChf')} />
                <span className={s.hint}>Le prix normal de l'article, hors promotion. Sans remise, c'est ce que paie le client.</span>
                {errors.priceChf && <span className={s.err}>{errors.priceChf.message}</span>}
              </div>

              <div className={s.field}>
                <label className={s.label} htmlFor="discountMode">Appliquer une remise</label>
                <div className={s.discountRow}>
                  <select
                    id="discountMode"
                    className={s.discountModeSelect}
                    value={discountMode}
                    onChange={(e) => { setDiscountMode(e.target.value); if (e.target.value === 'none') setDiscountValue('') }}
                  >
                    <option value="none">Aucune remise</option>
                    <option value="percent">Remise en %</option>
                    <option value="fixed">Remise en CHF</option>
                  </select>
                  {discountMode !== 'none' && (
                    <input
                      aria-label="Valeur de la réduction"
                      type="number"
                      step={discountMode === 'percent' ? '1' : '0.05'}
                      min="0"
                      max={discountMode === 'percent' ? '99' : undefined}
                      className={s.discountValueInput}
                      placeholder={discountMode === 'percent' ? 'ex: 20' : 'ex: 15'}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                    />
                  )}
                </div>
                <span className={s.hint}>Optionnel. La remise est déduite du prix de vente : le client paie moins, et le prix normal s'affiche barré à côté.</span>
              </div>
            </div>

            {discountMode !== 'none' && discountValue && (
              <div className={s.pricePreview}>
                <span className={s.pricePreviewLabel}>Aperçu boutique</span>
                <div className={s.pricePreviewRow}>
                  {promoPrice != null ? (
                    <>
                      <span className={s.priceOld}>CHF {Number(watchedPrice).toFixed(2)}</span>
                      <span className={s.priceNew}>CHF {promoPrice.toFixed(2)}</span>
                    </>
                  ) : (
                    <span className={s.priceWarning}>
                      <AlertTriangle size={12} />
                      Remise invalide — elle doit rester inférieure au prix de vente.
                    </span>
                  )}
                </div>
                {/* Phrase explicite : le prix barré étant calculé à partir du prix payé,
                    l'affichage seul de deux montants laissait croire que la remise
                    augmentait le prix du produit. */}
                {promoPrice != null && (
                  <p className={s.pricePreviewNote}>
                    Le client paie <strong>CHF {promoPrice.toFixed(2)}</strong> — le prix
                    barré affiché sera <strong>CHF {Number(watchedPrice).toFixed(2)}</strong>.
                  </p>
                )}
              </div>
            )}

            {/* ── Période de la promotion ──
                Affichée seulement quand une remise est saisie : sans prix barré,
                des dates seules n'auraient aucun effet. */}
            {discountMode !== 'none' && (
              <div className={s.promoDates}>
                <div className={s.promoDatesHead}>
                  <CalendarClock size={14} aria-hidden="true" />
                  <span>Période de la promotion</span>
                </div>
                <p className={s.promoDatesHint}>
                  Laissez vide pour une promotion sans limite. À la date de fin, le produit
                  revient automatiquement à son prix normal
                  {promoPrice != null ? ` (CHF ${Number(watchedPrice).toFixed(2)})` : ''} — aucune
                  action de votre part.
                </p>
                <div className={s.formGrid}>
                  <div className={s.field}>
                    <label className={s.label} htmlFor="promoStartsAt">Début</label>
                    <input
                      id="promoStartsAt"
                      type="datetime-local"
                      className={s.input}
                      {...register('promoStartsAt')}
                    />
                    <span className={s.hint}>Vide = démarre immédiatement.</span>
                  </div>
                  <div className={s.field}>
                    <label className={s.label} htmlFor="promoEndsAt">Fin</label>
                    <input
                      id="promoEndsAt"
                      type="datetime-local"
                      className={`${s.input} ${errors.promoEndsAt ? s.inputError : ''}`}
                      {...register('promoEndsAt')}
                    />
                    {errors.promoEndsAt
                      ? <span className={s.err}>{errors.promoEndsAt.message}</span>
                      : <span className={s.hint}>Vide = sans échéance.</span>}
                  </div>
                </div>
                {promoStatus && (
                  <p className={`${s.promoStatus} ${s[promoStatus.tone]}`}>{promoStatus.label}</p>
                )}
              </div>
            )}

            <div className={s.field}>
              <label className={s.label} htmlFor="stock">Stock *</label>
              <input id="stock" type="number" min="0" className={`${s.input} ${errors.stock ? s.inputError : ''}`} {...register('stock')} />
              {errors.stock && <span className={s.err}>{errors.stock.message}</span>}
            </div>

          {/* ── Vente à la coupe (ADM-12) ──
              Trames et bandes à broder : le prix saisi est alors un prix AU
              MÈTRE, et la cliente commande la longueur dont elle a besoin. */}
          <div className={s.cutSection}>
            <label className={s.checkRow}>
              <input type="checkbox" form="product-form" {...register('soldByLength')} />
              <span>Vendu à la coupe (au mètre)</span>
            </label>

            {soldByLengthChecked && (
              <>
                <p className={s.fieldHint}>
                  Le prix ci-dessus devient un <strong>prix au mètre</strong>, et le stock se
                  compte en <strong>mètres</strong>.
                </p>

                <div className={s.formGrid}>
                  <div className={s.field}>
                    <label className={s.label} htmlFor="lengthStepCm">Vendu par tranches de (cm)</label>
                    <input
                      id="lengthStepCm"
                      type="number"
                      min="1"
                      max="100"
                      className={`${s.input} ${errors.lengthStepCm ? s.inputError : ''}`}
                      {...register('lengthStepCm')}
                    />
                    {errors.lengthStepCm && <span className={s.err}>{errors.lengthStepCm.message}</span>}
                  </div>

                  <div className={s.field}>
                    <label className={s.label} htmlFor="lengthMinCm">Longueur minimale (cm)</label>
                    <input
                      id="lengthMinCm"
                      type="number"
                      min="1"
                      max="1000"
                      className={`${s.input} ${errors.lengthMinCm ? s.inputError : ''}`}
                      {...register('lengthMinCm')}
                    />
                    {errors.lengthMinCm && <span className={s.err}>{errors.lengthMinCm.message}</span>}
                  </div>
                </div>

                {cutPreview}
              </>
            )}
          </div>

          {/* Historique des prix (ADM-21) — visible sur une fiche existante
              uniquement : un produit en cours de création n'a pas de passé. */}
          <PriceHistory productId={isEdit ? Number(id) : null} />
        </section>

        </form>
        </div>

        <aside className={s.sideCol}>
          {/* Visibilité — regroupée à part : ce sont les réglages qui décident si
              et où le produit apparaît, pas des attributs descriptifs. Ils étaient
              noyés au milieu des dimensions et du poids. */}
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Visibilité</h2>
            <div className={s.checkGroup}>
              <label className={s.checkRow}>
                <input type="checkbox" form="product-form" {...register('isActive')} />
                <span>Produit actif (visible en boutique)</span>
              </label>
              <label className={s.checkRow}>
                <input type="checkbox" form="product-form" {...register('isFeatured')} />
                <span>Mis en avant (page d'accueil)</span>
              </label>
              <label className={s.checkRow}>
                <input type="checkbox" form="product-form" {...register('isMadeToOrder')} />
                <span>
                  Sur commande — commandable sans stock
                  {supplierDelay && ` (délai ${supplierDelay})`}
                </span>
              </label>
            </div>

            {isMadeToOrderChecked && !supplierDelay && (
              <p className={s.supplierDelayWarning}>
                <AlertTriangle size={12} />
                {selectedSupplier
                  ? `Le fournisseur « ${selectedSupplier.name} » n'a pas de délai configuré — le texte générique « 3 à 4 semaines » sera affiché en boutique. Configurez son délai dans l'onglet Fournisseurs.`
                  : "Aucun fournisseur sélectionné — le texte générique « 3 à 4 semaines » sera affiché en boutique. Choisissez un fournisseur avec un délai configuré."}
              </p>
            )}
          </section>

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
        </aside>
        </div>
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
