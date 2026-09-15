import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Edit2, ImageOff, AlertTriangle, Layout, Eye, ChevronDown, X, GripVertical } from 'lucide-react'
import {
  getProducts, getProductById, updateProduct, updateFeaturedOrder, getBrands,
} from '../../services/products.service.js'
import { useToast } from '../../contexts/ToastContext.jsx'
import s from './FeaturedShowcase.module.css'

/* Nombre de slots de la vitrine home — doit rester aligné sur le bento de la boutique */
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

/* ── Sélecteur de produit ─────────────────────────────────────────────────
   Modale plein écran, à la place de la liste déroulante coincée dans un
   emplacement de 268 px : les noms y étaient tronqués (« Abris Art, kit perles
   D… »), les vignettes illisibles et seuls 6 résultats sur 15 497 remontaient,
   sans dire combien manquaient. On choisit un produit pour sa photo, il faut
   donc pouvoir la voir. */
function ProductPicker({ slotIndex, isLarge, alreadyPicked, onPick, onClose }) {
  const [q, setQ]             = useState('')
  const [brand, setBrand]     = useState('')
  const [brands, setBrands]   = useState([])
  const [results, setResults] = useState([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef              = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { getBrands().then(setBrands).catch(() => {}) }, [])

  // Fermeture à Échap — attendu de toute modale
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  /* La liste se charge dès l'ouverture, sans attendre une saisie : la vitrine se
     compose souvent en parcourant les nouveautés, pas en cherchant un nom précis.
     Seuls les produits actifs ET illustrés sont proposés — mettre en avant un
     produit sans photo laisserait un trou gris sur la page d'accueil. */
  useEffect(() => {
    setLoading(true)
    const timer = setTimeout(() => {
      /* image_first : le catalogue photo est incomplet (8 624 images sur 15 497
         produits), et le tri par date ne remontait aucun produit illustré — un
         écran de vignettes grises alors qu'on choisit justement sur la photo. */
      const params = { limit: 24, is_active: 'true', sort: 'created_at', order: 'desc', image_first: 'true' }
      if (q.trim()) params.q = q.trim()
      if (brand)    params.brand = brand
      getProducts(params)
        .then(res => {
          setResults(res.data ?? [])
          setTotal(res.pagination?.total ?? 0)
        })
        .catch(() => { setResults([]); setTotal(0) })
        .finally(() => setLoading(false))
    }, q ? 300 : 0)
    return () => clearTimeout(timer)
  }, [q, brand])

  return (
    <div className={s.pickerOverlay} onClick={onClose}>
      <div className={s.pickerModal} onClick={e => e.stopPropagation()} role="dialog" aria-label="Choisir un produit">
        <div className={s.pickerHead}>
          <div>
            <span className={s.pickerTitle}>
              Choisir un produit — emplacement {slotIndex + 1}
            </span>
            {isLarge && <span className={s.pickerBadge}>Vedette · grande carte</span>}
          </div>
          <button className={s.pickerClose} onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>

        <div className={s.pickerFilters}>
          <div className={s.pickerSearchWrap}>
            <Search size={14} className={s.pickerSearchIcon} />
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Nom, référence, fournisseur ou marque…"
              className={s.pickerSearchField}
            />
            {q && (
              <button className={s.pickerSearchClear} onClick={() => setQ('')} aria-label="Effacer">
                <X size={13} />
              </button>
            )}
          </div>
          <select className={s.pickerSelect} value={brand} onChange={e => setBrand(e.target.value)}>
            <option value="">Toutes les marques</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div className={s.pickerBody}>
          {loading ? (
            <p className={s.pickerHint}>Recherche…</p>
          ) : results.length === 0 ? (
            <p className={s.pickerHint}>Aucun produit ne correspond.</p>
          ) : (
            <ul className={s.pickerGrid}>
              {results.map(p => {
                const picked = alreadyPicked.includes(p.id)
                return (
                  <li key={p.id}>
                    {/* Un produit déjà placé reste visible mais non sélectionnable :
                        le retirer de la liste ferait croire qu'il a disparu du catalogue. */}
                    <button
                      className={`${s.pickerCard} ${picked ? s.pickerCardPicked : ''}`}
                      onClick={() => !picked && onPick(p)}
                      disabled={picked}
                      title={picked ? 'Déjà dans la vitrine' : p.name}
                    >
                      <div className={s.pickerImg}>
                        {p.image_url
                          ? <img src={p.image_url} alt="" loading="lazy" />
                          : <ImageOff size={18} />
                        }
                        {picked && <span className={s.pickerPickedTag}>Déjà en vitrine</span>}
                      </div>
                      <p className={s.pickerName}>{p.name}</p>
                      <p className={s.pickerMeta}>
                        CHF {Number(p.price_chf).toFixed(2)}
                        {p.stock === 0 && <span className={s.pickerOut}> · rupture</span>}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Dit toujours ce qu'on voit par rapport au total : « 24 sur 3 812 »
            évite de croire que la recherche n'a rien trouvé d'autre. */}
        <div className={s.pickerFoot}>
          {loading ? '…' : total > results.length
            ? `${results.length} produits affichés sur ${total.toLocaleString('fr-CH')} — affinez la recherche pour voir les autres`
            : `${total.toLocaleString('fr-CH')} produit${total > 1 ? 's' : ''}`}
        </div>
      </div>
    </div>
  )
}

// ── Bande vitrine home ─────────────────────────────────────────────────────
function FeaturedSlots({ featuredProducts, onEdit, onRemove, onAdd, onReorder }) {
  const count                           = featuredProducts.length
  const [open, setOpen]                 = useState(true)
  const [preview, setPreview]           = useState(false)
  const [activeSearch, setActiveSearch] = useState(null)

  /* Ordre local affiché pendant le drag — resynchronisé dès que featuredProducts change côté serveur */
  const [order, setOrder]     = useState(featuredProducts)
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)
  useEffect(() => { setOrder(featuredProducts) }, [featuredProducts])

  function handleDragStart(i) {
    setDragIndex(i)
  }
  function handleDragOver(e, i) {
    e.preventDefault()
    if (i !== overIndex) setOverIndex(i)
  }
  function handleDrop(i) {
    if (dragIndex === null || dragIndex === i) { setDragIndex(null); setOverIndex(null); return }
    const next = [...order]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(i, 0, moved)
    setOrder(next)
    setDragIndex(null)
    setOverIndex(null)
    onReorder(next.map(p => p.id))
  }
  function handleDragEnd() {
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <>
      {preview && <BentoPreview products={order} onClose={() => setPreview(false)} />}
      {activeSearch !== null && (
        <ProductPicker
          slotIndex={activeSearch}
          isLarge={activeSearch === 0}
          /* Les produits déjà en vitrine sont grisés : sans cela, on pouvait
             placer deux fois le même et créer un doublon sur l'accueil. */
          alreadyPicked={order.map(p => p.id)}
          onPick={(p) => { onAdd(p); setActiveSearch(null) }}
          onClose={() => setActiveSearch(null)}
        />
      )}
      <div className={s.featuredBar}>
        {/* « bento grid » était du jargon technique : le titre dit maintenant à quoi
            sert le bloc. Les emplacements vides sont signalés comme un défaut —
            ce sont de vrais trous sur la page d'accueil, pas un état neutre. */}
        <button className={s.featuredBarHead} onClick={() => setOpen(v => !v)} aria-expanded={open}>
          <Layout size={14} className={s.featuredBarIcon} />
          <span className={s.featuredBarTitle}>Produits mis en avant sur l’accueil</span>
          <span className={`${s.featuredBarCount} ${count >= FEATURED_MAX ? s.featuredBarCountFull : ''}`}>
            {count} / {FEATURED_MAX}
          </span>
          {count > FEATURED_MAX && (
            <span className={s.featuredBarWarn}>
              <AlertTriangle size={12} /> {count - FEATURED_MAX} de trop
            </span>
          )}
          {count < FEATURED_MAX && (
            <span className={s.featuredBarWarn}>
              <AlertTriangle size={12} />
              {FEATURED_MAX - count} emplacement{FEATURED_MAX - count > 1 ? 's' : ''} vide{FEATURED_MAX - count > 1 ? 's' : ''} sur l’accueil
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
            const product = order[i]
            const isFirst = i === 0

            if (product) {
              return (
                <div
                  key={product.id}
                  className={`${s.featuredSlot} ${isFirst ? s.featuredSlotLarge : ''} ${dragIndex === i ? s.featuredSlotDragging : ''} ${overIndex === i && dragIndex !== null && dragIndex !== i ? s.featuredSlotDragOver : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={handleDragEnd}
                >
                  {isFirst && <span className={s.featuredSlotLabel}>Vedette</span>}
                  <span className={s.featuredSlotHandle} title="Glisser pour réordonner">
                    <GripVertical size={13} />
                  </span>
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
                {isFirst && <span className={s.featuredSlotLabel}>Vedette</span>}
                <button className={s.featuredSlotAddBtn} onClick={() => setActiveSearch(i)}>
                  <Plus size={16} />
                  <span>Choisir un produit</span>
                </button>
              </div>
            )
          })}
          </div>
          {/* La grille reproduit désormais la disposition réelle : inutile
              d'expliquer que le premier slot est plus grand, cela se voit. */}
          <p className={s.featuredBarHint}>Glissez-déposez une carte pour changer l’ordre d’affichage</p>
          </>
        )}
      </div>
    </>
  )
}

/* ── Vitrine home — composant autonome ────────────────────────────────────────
   Charge ses propres données et porte ses propres actions : la page hôte n'a
   qu'à l'afficher. Elle vit sur le tableau de bord, où la configuration de la
   page d'accueil a davantage sa place que dans la liste de catalogue.
   `onChanged` prévient l'hôte qu'un produit a changé, pour qu'une liste
   affichée à côté puisse se rafraîchir. */
export default function FeaturedShowcase({ onChanged }) {
  const toast    = useToast()
  const navigate = useNavigate()
  const [featuredProducts, setFeaturedProducts] = useState([])

  const loadFeatured = useCallback(() => {
    getProducts({ is_featured: 'true', limit: 10, sort: 'created_at', order: 'asc' })
      .then(res => setFeaturedProducts(res.data ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => { loadFeatured() }, [loadFeatured])

  /* L'API attend le produit complet en PUT : on relit la fiche avant de ne
     changer que le drapeau `isFeatured`, sinon les champs absents du payload
     seraient écrasés. */
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
      },
    }
  }, [])

  const handleRemoveFeatured = useCallback(async (product) => {
    try {
      await updateProduct(product.id, await buildFeaturedPayload(product, false))
      loadFeatured()
      onChanged?.()
      toast.success(`"${product.name}" retiré de la vitrine.`)
    } catch {
      toast.error('Erreur lors de la mise à jour.')
    }
  }, [buildFeaturedPayload, loadFeatured, onChanged, toast])

  const handleAddFeatured = useCallback(async (product) => {
    try {
      await updateProduct(product.id, await buildFeaturedPayload(product, true))
      loadFeatured()
      onChanged?.()
      toast.success(`"${product.name}" ajouté à la vitrine.`)
    } catch {
      toast.error('Erreur lors de la mise à jour.')
    }
  }, [buildFeaturedPayload, loadFeatured, onChanged, toast])

  /* Persiste le nouvel ordre après un drag & drop */
  const handleReorderFeatured = useCallback(async (productIds) => {
    try {
      await updateFeaturedOrder(productIds)
      loadFeatured()
    } catch {
      toast.error('Erreur lors de la mise à jour de l\'ordre.')
      loadFeatured() // resynchronise l'affichage avec le vrai ordre serveur en cas d'échec
    }
  }, [loadFeatured, toast])

  return (
    <FeaturedSlots
      featuredProducts={featuredProducts}
      onEdit={(product) => navigate(`/produits/${product.id}`)}
      onRemove={handleRemoveFeatured}
      onAdd={handleAddFeatured}
      onReorder={handleReorderFeatured}
    />
  )
}
