import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Upload, Star, AlertTriangle, Check, Trash2, CalendarClock,
  FileText, Image as ImageIcon, Tag, Package, Truck, Eye, FolderTree, ExternalLink, Hash,
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
import Card from '../../components/ui/Card/Card.jsx'
import CategoryPicker from './CategoryPicker.jsx'
import { roundCHF } from '../../utils/chf.js'
import { CM_PER_METER, MAX_STOCK_METERS, stockToInput, stockFromInput, formatStock } from '../../utils/stock.js'
import PriceHistory from '../../components/PriceHistory/PriceHistory.jsx'
import s from './ProductForm.module.css'

const schema = z.object({
  name:             z.string().min(1, 'Nom requis'),
  sku:              z.string().min(1, 'SKU requis'),
  priceChf:         z.coerce.number().positive('Prix invalide'),
  // Pièces entières, ou mètres à deux décimales pour la coupe (ADM-12) — voir le refine
  stock:            z.coerce.number().min(0, 'Stock invalide').max(MAX_STOCK_METERS, 'Stock trop élevé'),
  /* Stock minimum (ADM-09) — vide = article non suivi au réassort. Même règle
     d'unité que le stock (voir les refine) */
  stockMin:         z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number({ invalid_type_error: 'Stock minimum invalide' }).min(0, 'Stock minimum invalide').max(MAX_STOCK_METERS, 'Stock minimum trop élevé').nullable(),
  ),
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
).refine(
  (d) => d.soldByLength || Number.isInteger(d.stock),
  { path: ['stock'], message: 'Nombre entier de pièces.' },
).refine(
  (d) => d.soldByLength || d.stockMin === null || Number.isInteger(d.stockMin),
  { path: ['stockMin'], message: 'Nombre entier de pièces.' },
).refine(
  (d) => !d.soldByLength || d.stockMin === null
    || Math.abs(d.stockMin * CM_PER_METER - Math.round(d.stockMin * CM_PER_METER)) < 1e-6,
  { path: ['stockMin'], message: 'Deux décimales au maximum (ex. 2.15).' },
).refine(
  // Au centimètre près : 2.15 m oui, 2.155 m non (tolérance d'arrondi binaire)
  (d) => !d.soldByLength || Math.abs(d.stock * CM_PER_METER - Math.round(d.stock * CM_PER_METER)) < 1e-6,
  { path: ['stock'], message: 'Deux décimales au maximum (ex. 2.15).' },
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

  /* Zone d'ajout — compacte (retour du 25.09 : « la carte photos est trop
     grosse ») : une case de la taille d'une vignette à la suite des photos, ou
     un bandeau d'une ligne tant que le produit n'en a aucune. */
  const dropZone = (
    <div
      className={`${s.dropZone} ${images.length ? s.dropZoneTile : s.dropZoneStrip} ${dragging ? s.dropZoneActive : ''} ${uploading ? s.dropZoneUploading : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={(e) => { if (e.target === inputRef.current) return; if (!uploading) inputRef.current?.click() }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      aria-label="Ajouter des photos — JPG, PNG ou WebP, 5 Mo maximum"
      title="JPG, PNG ou WebP · 5 Mo max. par photo"
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
        <>
          <span className={s.spinner} aria-hidden="true" />
          <span className={s.dropZoneText}>Envoi…</span>
        </>
      ) : images.length ? (
        <>
          <Upload size={18} className={s.dropZoneIcon} aria-hidden="true" />
          <span className={s.dropZoneText}>Ajouter</span>
        </>
      ) : (
        <>
          <Upload size={18} className={s.dropZoneIcon} aria-hidden="true" />
          <span className={s.dropZoneText}>Glissez vos photos ici <span>ou cliquez pour parcourir</span></span>
          <span className={s.dropZoneHint}>JPG, PNG ou WebP · 5 Mo max.</span>
        </>
      )}
    </div>
  )

  return (
    <div className={s.imageSection}>
      {images.length > 0 ? (
        <div className={s.imageGrid}>
          {images.map((img) => (
            <div key={img.id} className={`${s.imageThumb} ${img.isPrimary ? s.imagePrimary : ''}`}>
              <img
                src={img.url_thumbnail ?? img.urls?.thumbnail ?? img.url}
                alt={img.alt ?? ''}
                className={s.imageThumbImg}
              />
              {img.isPrimary && (
                <span className={s.primaryBadge}><Star size={8} fill="currentColor" aria-hidden="true" /> Principale</span>
              )}
              <div className={s.imageThumbActions}>
                {!img.isPrimary && (
                  <button
                    type="button"
                    className={s.imageActionBtn}
                    onClick={() => handleSetPrimary(img.id)}
                    disabled={!!settingId}
                    title="Définir comme photo principale"
                    aria-label="Définir comme photo principale"
                  >
                    {settingId === img.id
                      ? <span className={s.spinnerSm} />
                      : <Star size={11} aria-hidden="true" />
                    }
                  </button>
                )}
                <button
                  type="button"
                  className={`${s.imageActionBtn} ${s.imageActionDanger}`}
                  onClick={() => handleDelete(img.id)}
                  disabled={!!settingId}
                  title="Supprimer la photo"
                  aria-label="Supprimer la photo"
                >
                  <Trash2 size={11} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
          {dropZone}
        </div>
      ) : dropZone}

      {error && <p className={s.imageError}><AlertTriangle size={12} aria-hidden="true" /> {error}</p>}
    </div>
  )
}

// Liste d'identifiants comparable d'un rendu à l'autre, quel que soit l'ordre de coche
const idsKey = (ids) => JSON.stringify([...ids].sort((a, b) => a - b))

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

  /* En-tête complet sorti de l'écran → version compacte collée en haut */
  const headRef = useRef(null)
  const [stuck, setStuck] = useState(false)

  /* Rayons secondaires (ADM-04) — hors React Hook Form : ce sont des cases à
     cocher multiples, pas un champ de saisie, et la liste est envoyée telle
     quelle au serveur. */
  const [secondaryCategoryIds, setSecondaryCategoryIds] = useState([])

  /* Valeurs d'origine de ce qui vit hors du formulaire (rayons, remise) : React
     Hook Form ne les voit pas. Sans elles, changer seulement une remise ou un
     rayon puis quitter la fiche ne demandait aucune confirmation. */
  const [initialExtras, setInitialExtras] = useState({ secondary: '[]', discountMode: 'none', discountValue: '' })

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

  const { register, handleSubmit, reset, watch, setValue, getValues, setError, formState: { errors, isSubmitting, dirtyFields } } = useForm({
    resolver: zodResolver(schema),
    /* Tous les champs ont une valeur initiale : sans elle, un champ vidé après
       saisie restait compté comme modifié ('' ≠ undefined). */
    defaultValues: {
      name: '', sku: '', description: '', brand: '', priceChf: '',
      categoryId: '', supplierId: '', taxRateId: '',
      weightKg: '', lengthCm: '', widthCm: '', promoStartsAt: '', promoEndsAt: '',
      isActive: true, isFeatured: false, isMadeToOrder: false, soldByLength: false,
      lengthStepCm: '10', lengthMinCm: '50', badge: '', stock: '0', stockMin: '',
    },
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

    /* Prix réellement payé aujourd'hui : le prix remisé pendant une promotion
       en cours (la boutique vend alors 50 cm au prix en action), le prix normal
       sinon — y compris pour une promotion programmée ou terminée. */
    const onPromo = promoPrice != null && promoStatus?.tone === 'promoStatusOn'
    const paidPerMeter = onPromo ? promoPrice : perMeter
    const perStep = roundCHF((paidPerMeter * step) / 100)
    const minTotal = roundCHF((paidPerMeter * min) / 100)
    const normalMinTotal = roundCHF((perMeter * min) / 100)
    return (
      <p className={s.cutPreview}>
        Commande minimale : <strong>{min} cm</strong> pour <strong>CHF {minTotal.toFixed(2)}</strong>
        {onPromo && <> (en action — CHF {normalMinTotal.toFixed(2)} au prix normal)</>}.
        Chaque tranche de {step} cm coûte CHF {perStep.toFixed(2)}.
      </p>
    )
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
      /* `name` indenté par des tirets pour les <option> du rayon principal ;
         `label` et `depth` pour la liste des rayons supplémentaires, indentée en CSS. */
      const sorted = []
      const visit = (parentId, depth) => {
        for (const c of byParent.get(parentId) ?? []) {
          sorted.push({ ...c, label: c.name, depth, name: depth > 0 ? `${'— '.repeat(depth)}${c.name}` : c.name })
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

  /* Rayon principal et fournisseur affichés une fois leurs listes arrivées (ADM-04).
     La fiche produit revient avant ces listes : le formulaire posait la valeur sur
     un <select> encore sans options, et le navigateur retombait sur « — Choisir — »
     / « — Aucun — ». Chaque fiche semblait donc avoir perdu son rayon — alors qu'il
     était bien enregistré — et une modification de catégorie paraissait ne jamais
     tenir. La valeur du formulaire, elle, était juste : on la réapplique au <select>. */
  useEffect(() => {
    if (categories.length === 0) return
    setValue('categoryId', getValues('categoryId') ?? '', { shouldDirty: false })
  }, [categories, getValues, setValue])

  useEffect(() => {
    if (suppliers.length === 0) return
    setValue('supplierId', getValues('supplierId') ?? '', { shouldDirty: false })
  }, [suppliers, getValues, setValue])

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
        let loadedMode = 'none'
        let loadedValue = ''
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
            loadedMode = 'percent'
            loadedValue = String(percent)
          } else {
            loadedMode = 'fixed'
            loadedValue = (oldPrice - paidPrice).toFixed(2)
          }
        }
        setDiscountMode(loadedMode)
        setDiscountValue(loadedValue)
        // Prix catalogue à afficher dans le champ, selon qu'une promo est active ou non
        const catalogPriceToShow = hasDiscount ? res.compare_price_chf : res.price_chf

        /* Valeurs des champs en TEXTE, comme les renvoie un <input> ou un
           <select> : rangé en nombre (22), un stock retapé à l'identique
           (« 22 ») restait compté comme modifié, et la fiche demandait
           confirmation alors que rien n'avait changé. */
        const asText = (value) => (value == null ? '' : String(value))
        reset({
          name:            res.name ?? '',
          sku:             res.sku ?? '',
          priceChf:        asText(catalogPriceToShow),
          // Article à la coupe : stock en centimètres en base, saisi en mètres (ADM-12)
          stock:           asText(stockToInput(res.stock, !!res.sold_by_length)),
          stockMin:        res.stock_min == null ? '' : asText(stockToInput(res.stock_min, !!res.sold_by_length)),
          weightKg:        asText(res.weight_kg),
          lengthCm:        asText(res.length_cm),
          widthCm:         asText(res.width_cm),
          categoryId:      asText(res.category_id),
          // secondary_category_ids est hors formulaire — repris juste après via setSecondaryCategoryIds
          supplierId:      asText(res.supplier_id),
          taxRateId:       res.tax_rate_id ?? '',
          isFeatured:      !!res.is_featured,
          isMadeToOrder:   !!res.is_made_to_order,
          soldByLength:    !!res.sold_by_length,
          lengthStepCm:    asText(res.length_step_cm ?? 10),
          lengthMinCm:     asText(res.length_min_cm  ?? 50),
          isActive:        !!res.is_active,
          badge:           res.badge ?? '',
          brand:           res.brand ?? '',
          description:     res.description_fr ?? '',
          promoStartsAt:   toDateTimeLocal(res.promo_starts_at),
          promoEndsAt:     toDateTimeLocal(res.promo_ends_at),
        })
        setSecondaryCategoryIds(res.secondary_category_ids ?? [])
        setInitialExtras({
          secondary:     idsKey(res.secondary_category_ids ?? []),
          discountMode:  loadedMode,
          discountValue: loadedValue,
        })
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
  const extrasDirty = idsKey(secondaryCategoryIds) !== initialExtras.secondary
    || discountMode !== initialExtras.discountMode
    || (discountMode !== 'none' && discountValue !== initialExtras.discountValue)
  /* Champs réellement modifiés, et non `isDirty` : celui-ci comparait tout le
     formulaire aux valeurs initiales et passait à vrai dès l'ouverture d'une
     fiche neuve (taux de TVA posé automatiquement) — la page annonçait des
     modifications et demandait confirmation sans que rien n'ait été saisi. */
  const hasChanges = Object.keys(dirtyFields).length > 0 || extrasDirty

  const goBack = () => {
    if (hasChanges && !saved) {
      setConfirmLeave(true)
      return
    }
    leave()
  }

  /* Même garde pour la fermeture d'onglet ou le rechargement — là où React Router
     n'a pas la main. Le navigateur impose son propre message, on ne peut que
     déclencher l'invite. */
  useEffect(() => {
    if (!hasChanges || saved) return
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasChanges, saved])

  useEffect(() => {
    const el = headRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [loading])

  /* Enregistrement refusé par la validation du formulaire (ADM-04). Le curseur
     part sur le premier champ en erreur, mais rien n'expliquait le refus : en
     cochant des rayons en bas de fiche, on voyait la page sauter sans savoir
     pourquoi rien n'était enregistré — un article importé sans SKU ne pouvait
     plus être modifié du tout. Les erreurs sont résumées dans le bandeau. */
  const onInvalid = (formErrors) => {
    const messages = [...new Set(Object.values(formErrors).map(e => e?.message).filter(Boolean))]
    setApiError(`Rien n'a été enregistré — à corriger : ${messages.join(' · ') || 'champs signalés en rouge'}.`)
  }

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
        stock:           stockFromInput(data.stock, !!data.soldByLength),
        stockMin:        data.stockMin === null ? null : stockFromInput(data.stockMin, !!data.soldByLength),
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
         l'enregistrement a échoué.
         `leave` et non `goBack` : ce rappel voit l'état du rendu d'avant
         l'enregistrement (`saved` encore faux, formulaire modifié), et la garde
         affichait « Vos modifications ne sont pas enregistrées » à chaque
         enregistrement réussi. Tout est sauvegardé, il n'y a rien à protéger. */
      setTimeout(() => (isEdit ? leave() : navigate('/produits')), 500)
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

  /* ── En-tête : l'état ENREGISTRÉ du produit ──
     Le nom en grand d'abord, comme « Commande 2026-09/22 » sur la page commande,
     puis ce qu'on vérifie d'un coup d'œil avant de modifier : en ligne ou non,
     le stock, la référence. Les pastilles décrivent le produit tel qu'il est en
     boutique, pas la saisie en cours. */
  const primaryImage = images.find(i => i.isPrimary) ?? images[0] ?? null
  const shopUrl = product?.slug && product?.is_active
    ? `${(import.meta.env.VITE_SHOP_URL ?? '').replace(/\/$/, '')}/produit/${product.slug}`
    : null
  const stockState = (() => {
    if (!product) return null
    const qty = Number(product.stock) || 0
    if (qty <= 0) {
      return product.is_made_to_order
        ? { tone: 'warning', label: 'Rupture — vendu sur commande' }
        : { tone: 'danger', label: 'Rupture de stock' }
    }
    if (product.stock_min != null && qty <= Number(product.stock_min)) {
      return { tone: 'warning', label: `Stock bas · ${formatStock(product)}` }
    }
    return { tone: 'neutral', label: `${formatStock(product)} en stock` }
  })()

  // Promotion enregistrée : prix barré réel, et dans sa période (ou programmée)
  const promoState = (() => {
    const paid = Number(product?.price_chf)
    const normal = Number(product?.compare_price_chf)
    if (!(normal > paid && paid > 0)) return null
    const now = new Date()
    const start = product.promo_starts_at ? new Date(product.promo_starts_at) : null
    const end   = product.promo_ends_at   ? new Date(product.promo_ends_at)   : null
    if (end && end <= now) return null
    const percent = Math.round((1 - paid / normal) * 100)
    if (start && start > now) return { tone: 'info', label: `Promotion programmée · −${percent} %` }
    return { tone: 'promo', label: `En promotion · −${percent} %` }
  })()

  const headTitle = isEdit ? (product?.name || 'Produit sans nom') : 'Nouveau produit'

  /* « Enregistrer » grisé tant qu'une fiche existante n'a pas changé : l'état
     se lit sur le bouton lui-même. Une fiche neuve reste enregistrable, pour
     afficher ce qui manque. */
  const nothingToSave = isEdit && !hasChanges
  const actionButtons = (
    <>
      <button type="button" className={s.btnCancel} onClick={goBack}>Annuler</button>
      <button
        type="submit"
        form="product-form"
        className={s.btnSave}
        disabled={isSubmitting || saved || nothingToSave}
        title={nothingToSave ? 'Aucune modification à enregistrer' : undefined}
      >
        {saved
          ? <><Check size={15} aria-hidden="true" /> Enregistré</>
          : isSubmitting ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer le produit'}
      </button>
    </>
  )

  if (loading) {
    return (
      <div className={s.page} aria-busy="true" aria-label="Chargement du produit">
        <span className={`${s.skeleton} ${s.skeletonHead}`} />
        <div className={s.layout}>
          <div className={s.main}>
            <span className={`${s.skeleton} ${s.skeletonCardTall}`} />
            <span className={`${s.skeleton} ${s.skeletonCard}`} />
          </div>
          <div className={s.side}>
            <span className={`${s.skeleton} ${s.skeletonCard}`} />
          </div>
        </div>
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

      <header className={s.head} ref={headRef}>
        <button type="button" className={s.backBtn} onClick={goBack} aria-label="Retour à la liste des produits">
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        {isEdit && (
          <div className={s.headThumb} aria-hidden="true">
            {primaryImage
              ? <img src={primaryImage.url_thumbnail ?? primaryImage.urls?.thumbnail ?? primaryImage.url} alt="" />
              : <Package size={22} />}
          </div>
        )}
        <div className={s.headMain}>
          <h1 className={s.title}>{headTitle}</h1>
          {isEdit && product ? (
            <p className={s.meta}>
              <span className={s.chip} data-tone={product.is_active ? 'success' : 'muted'}>
                <span className={s.chipDot} aria-hidden="true" />
                {product.is_active ? 'En ligne' : 'Masqué en boutique'}
              </span>
              {stockState && <span className={s.chip} data-tone={stockState.tone}>{stockState.label}</span>}
              {promoState && <span className={s.chip} data-tone={promoState.tone}>{promoState.label}</span>}
              {product.sku && (
                <span className={s.metaItem}><Hash size={13} aria-hidden="true" /> {product.sku}</span>
              )}
              {shopUrl && (
                <a className={s.metaLink} href={shopUrl} target="_blank" rel="noopener noreferrer">
                  Voir en boutique <ExternalLink size={12} aria-hidden="true" />
                </a>
              )}
            </p>
          ) : !isEdit && (
            <p className={s.meta}>Renseignez au moins le nom, la référence, le rayon principal, le prix et le stock.</p>
          )}
        </div>
        <div className={s.headActions}>
          {/* Annoncé aux lecteurs d'écran à chaque changement d'état */}
          <p className={s.saveState} data-state={saved ? 'saved' : hasChanges ? 'dirty' : 'clean'} aria-live="polite">
            {saved
              ? <><Check size={14} aria-hidden="true" /> Enregistré</>
              : hasChanges && <><span className={s.saveDot} aria-hidden="true" /> Modifications non enregistrées</>}
          </p>
          {actionButtons}
        </div>
      </header>

      {/* Version compacte de l'en-tête, collée en haut de l'écran dès que
          l'en-tête complet en sort : le nom et « Enregistrer » restent à portée
          sans barre permanente en bas de page. Posée par-dessus le contenu :
          elle ne décale rien en apparaissant. */}
      {stuck && (
        <div className={s.stickyBar}>
          <div className={s.stickyInner}>
            <button type="button" className={s.backBtn} onClick={goBack} aria-label="Retour à la liste des produits">
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
            <p className={s.stickyTitle}>{headTitle}</p>
            {hasChanges && !saved && (
              <span className={s.stickyDirty}><span className={s.saveDot} aria-hidden="true" /> Non enregistré</span>
            )}
            {actionButtons}
          </div>
        </div>
      )}

      {apiError && (
        <div className={s.apiError} role="alert"><AlertTriangle size={14} aria-hidden="true" /> {apiError}</div>
      )}

      {/* Tout le formulaire, colonne latérale comprise : un seul <form>, plus de
          champs rattachés à distance par l'attribut form=. */}
      <form onSubmit={handleSubmit(onSubmit, onInvalid)} id="product-form" className={s.layout}>
        {/* ── Colonne principale : ce qu'on modifie le plus souvent ── */}
        <div className={s.main}>
          <Card title="Description" icon={FileText} className={s.orderDescription} bodyClassName={s.cardBody}>
            <div className={s.field}>
              <label className={s.label} htmlFor="name">Nom du produit *</label>
              <input id="name" className={`${s.input} ${s.inputLarge} ${errors.name ? s.inputError : ''}`} {...register('name')} />
              {errors.name && <span className={s.err}>{errors.name.message}</span>}
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="description">Description</label>
              <textarea
                id="description"
                className={`${s.input} ${s.textarea}`}
                rows={6}
                placeholder="Ce que la cliente voit sous le nom du produit : contenu du kit, dimensions, conseils…"
                {...register('description')}
              />
            </div>
          </Card>

          <Card title="Prix" icon={Tag} className={s.orderPrice} bodyClassName={s.cardBody}>
            <div className={s.formGrid}>
              <div className={s.field}>
                <label className={s.label} htmlFor="priceChf">Prix de vente (CHF) *</label>
                <input id="priceChf" type="number" step="0.05" min="0" inputMode="decimal" className={`${s.input} ${errors.priceChf ? s.inputError : ''}`} {...register('priceChf')} />
                {errors.priceChf
                  ? <span className={s.err}>{errors.priceChf.message}</span>
                  : <span className={s.hint}>Le prix normal, hors promotion. Sans remise, c’est ce que paie la cliente.</span>}
              </div>

              <div className={s.field}>
                <label className={s.label} htmlFor="discountMode">Appliquer une remise</label>
                <div className={s.discountRow}>
                  <select
                    id="discountMode"
                    className={s.input}
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
                      inputMode="decimal"
                      className={`${s.input} ${s.discountValue}`}
                      placeholder={discountMode === 'percent' ? 'ex. 20' : 'ex. 15'}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                    />
                  )}
                </div>
                <span className={s.hint}>Déduite du prix de vente : la cliente paie moins, le prix normal s’affiche barré.</span>
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
                      <AlertTriangle size={12} aria-hidden="true" />
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
                    <input id="promoStartsAt" type="datetime-local" className={s.input} {...register('promoStartsAt')} />
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

            {/* Historique des prix (ADM-21) — visible sur une fiche existante
                uniquement : un produit en cours de création n'a pas de passé. */}
            <PriceHistory productId={isEdit ? Number(id) : null} />
          </Card>

          <Card title="Stock et approvisionnement" icon={Package} className={s.orderStock} bodyClassName={s.cardBody}>
            <div className={s.formGrid}>
              <div className={s.field}>
                <label className={s.label} htmlFor="sku">Référence (SKU) *</label>
                <input id="sku" className={`${s.input} ${s.mono} ${errors.sku ? s.inputError : ''}`} {...register('sku')} />
                {errors.sku && <span className={s.err}>{errors.sku.message}</span>}
              </div>
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
                <label className={s.label} htmlFor="stock">{soldByLengthChecked ? 'Stock (mètres) *' : 'Stock *'}</label>
                <input
                  id="stock"
                  type="number"
                  min="0"
                  max={MAX_STOCK_METERS}
                  /* « any » : la règle (entier ou deux décimales) est vérifiée par
                     le schéma, avec un message en français sous le champ plutôt
                     que la bulle du navigateur */
                  step="any"
                  inputMode={soldByLengthChecked ? 'decimal' : 'numeric'}
                  className={`${s.input} ${errors.stock ? s.inputError : ''}`}
                  {...register('stock')}
                />
                {errors.stock
                  ? <span className={s.err}>{errors.stock.message}</span>
                  : soldByLengthChecked && <span className={s.hint}>En mètres, deux décimales (ex. 2.15).</span>}
              </div>

              {/* Stock minimum (ADM-09) — règle unique du réassort : sous ce seuil,
                  la page Réassort propose de commander la différence. */}
              <div className={s.field}>
                <label className={s.label} htmlFor="stockMin">{soldByLengthChecked ? 'Stock minimum (mètres)' : 'Stock minimum'}</label>
                <input
                  id="stockMin"
                  type="number"
                  min="0"
                  max={MAX_STOCK_METERS}
                  step="any"
                  inputMode={soldByLengthChecked ? 'decimal' : 'numeric'}
                  className={`${s.input} ${errors.stockMin ? s.inputError : ''}`}
                  {...register('stockMin')}
                />
                {errors.stockMin
                  ? <span className={s.err}>{errors.stockMin.message}</span>
                  : <span className={s.hint}>Sous ce seuil, le Réassort propose de commander la différence. Vide = non suivi.</span>}
              </div>
            </div>

            {/* Sur commande : un comportement de stock (commandable à zéro), avec
                le délai du fournisseur choisi juste au-dessus. */}
            <div className={s.option}>
              <label className={s.checkRow}>
                <input type="checkbox" {...register('isMadeToOrder')} />
                <span>
                  <span className={s.checkTitle}>Vendu sur commande</span>
                  <span className={s.checkHint}>
                    Commandable même sans stock{supplierDelay ? ` — délai affiché : ${supplierDelay}` : ''}.
                  </span>
                </span>
              </label>
              {isMadeToOrderChecked && !supplierDelay && (
                <p className={s.warning}>
                  <AlertTriangle size={13} aria-hidden="true" />
                  {selectedSupplier
                    ? `Le fournisseur « ${selectedSupplier.name} » n'a pas de délai configuré — le texte générique « 3 à 4 semaines » sera affiché en boutique. Configurez son délai dans l'onglet Fournisseurs.`
                    : "Aucun fournisseur sélectionné — le texte générique « 3 à 4 semaines » sera affiché en boutique. Choisissez un fournisseur avec un délai configuré."}
                </p>
              )}
            </div>

            {/* ── Vente à la coupe (ADM-12) ──
                Trames et bandes à broder : le prix saisi est alors un prix AU
                MÈTRE, et la cliente commande la longueur dont elle a besoin. */}
            <div className={s.option}>
              <label className={s.checkRow}>
                <input type="checkbox" {...register('soldByLength')} />
                <span>
                  <span className={s.checkTitle}>Vendu à la coupe (au mètre)</span>
                  <span className={s.checkHint}>Trames et bandes : le prix devient un prix au mètre, le stock se compte en mètres.</span>
                </span>
              </label>

              {soldByLengthChecked && (
                <div className={s.optionBody}>
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
                </div>
              )}
            </div>
          </Card>

          <Card
            title="Expédition"
            subtitle="Poids et format du colis, repris sur l’étiquette La Poste"
            icon={Truck}
            className={s.orderShipping}
            bodyClassName={s.cardBody}
          >
            <div className={s.formGrid3}>
              <div className={s.field}>
                <label className={s.label} htmlFor="weightKg">Poids (kg)</label>
                <input id="weightKg" type="number" step="0.001" min="0" inputMode="decimal" className={s.input} placeholder="ex. 0.150" {...register('weightKg')} />
              </div>
              <div className={s.field}>
                <label className={s.label} htmlFor="lengthCm">Longueur (cm)</label>
                <input id="lengthCm" type="number" step="0.1" min="0" inputMode="decimal" className={s.input} placeholder="ex. 30" {...register('lengthCm')} />
              </div>
              <div className={s.field}>
                <label className={s.label} htmlFor="widthCm">Largeur (cm)</label>
                <input id="widthCm" type="number" step="0.1" min="0" inputMode="decimal" className={s.input} placeholder="ex. 20" {...register('widthCm')} />
              </div>
            </div>
          </Card>
        </div>

        {/* ── Colonne latérale : le produit tel qu'il apparaît (photos, visibilité, rayons) ──
            Photos en tête, à côté de la description (demande du 25.09). */}
        <div className={s.side}>
          <Card
            title="Photos"
            icon={ImageIcon}
            className={s.orderPhotos}
            bodyClassName={s.cardBody}
            aside={isEdit && images.length > 0 && <span className={s.countChip}>{images.length}</span>}
          >
            {isEdit ? (
              imgLoading
                ? <p className={s.muted}>Chargement des photos…</p>
                : <ImageDropZone productId={Number(id)} images={images} onImagesChange={setImages} />
            ) : (
              <p className={s.note}>
                Les photos s’ajoutent une fois le produit créé : enregistrez-le, puis rouvrez sa fiche.
              </p>
            )}
          </Card>

          <Card title="Visibilité" icon={Eye} className={s.orderVisibility} bodyClassName={s.cardBody}>
            <label className={s.checkRow}>
              <input type="checkbox" {...register('isActive')} />
              <span>
                <span className={s.checkTitle}>Produit actif</span>
                <span className={s.checkHint}>Visible et commandable en boutique.</span>
              </span>
            </label>
            <label className={s.checkRow}>
              <input type="checkbox" {...register('isFeatured')} />
              <span>
                <span className={s.checkTitle}>Mis en avant</span>
                <span className={s.checkHint}>Proposé sur la page d’accueil.</span>
              </span>
            </label>
            <div className={s.field}>
              <label className={s.label} htmlFor="badge">Badge</label>
              <select id="badge" className={s.input} {...register('badge')}>
                <option value="">— Aucun badge —</option>
                <option value="nouveaute">Nouveauté</option>
                <option value="promo">Promo</option>
                <option value="coup_de_coeur">Coup de cœur</option>
                <option value="exclusif">Exclusif</option>
              </select>
              <span className={s.hint}>Étiquette affichée sur la photo en boutique.</span>
            </div>
          </Card>

          <Card title="Organisation" icon={FolderTree} className={s.orderOrganisation} bodyClassName={s.cardBody}>
            <div className={s.field}>
              <label className={s.label} htmlFor="categoryId">Catégorie principale *</label>
              <select id="categoryId" className={`${s.input} ${errors.categoryId ? s.inputError : ''}`} {...register('categoryId')}>
                <option value="">— Choisir —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {errors.categoryId
                ? <span className={s.err}>{errors.categoryId.message}</span>
                : <span className={s.hint}>Le rayon affiché sur la fiche du produit.</span>}
            </div>

            {/* Rayons supplémentaires (ADM-04) — un même article peut être rangé
                dans plusieurs rayons de la boutique. */}
            <div className={s.field}>
              <span className={s.label}>
                Autres rayons
                {secondaryCategoryIds.length > 0 && <span className={s.labelCount}> · {secondaryCategoryIds.length}</span>}
              </span>
              <span className={s.hint}>Le produit apparaît aussi dans ces rayons.</span>
              <CategoryPicker
                categories={categories.filter(c => c.id !== Number(categoryId))}
                selectedIds={secondaryCategoryIds}
                onToggle={toggleSecondaryCategory}
              />
            </div>

            <div className={s.field}>
              <label className={s.label} htmlFor="brand">Gamme</label>
              <input
                id="brand"
                className={`${s.input} ${errors.brand ? s.inputError : ''}`}
                placeholder="ex. Permin of Copenhagen"
                {...register('brand')}
              />
              {errors.brand && <span className={s.err}>{errors.brand.message}</span>}
            </div>
          </Card>
        </div>
      </form>
    </div>
  )
}
