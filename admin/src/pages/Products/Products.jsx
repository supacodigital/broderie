import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useDebounceSearch } from '../../hooks/useDebounceSearch.js'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Plus, Search, Edit2, Trash2,
  ImageOff, AlertTriangle,
  SlidersHorizontal, RotateCcw, Layout, Eye, ChevronDown, X,
} from 'lucide-react'
import {
  getProducts, getProductById, updateProduct, deleteProduct,
} from '../../services/products.service.js'
import { getCategories } from '../../services/categories.service.js'
import { getSuppliers } from '../../services/suppliers.service.js'
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

// ── Page principale ────────────────────────────────────────────────────────
export default function Products() {
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [products,    setProducts]    = useState([])
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(1)
  const { search: searchInput, debouncedSearch: search, handleSearch: handleSearchChange } = useDebounceSearch(300, () => setPage(1))
  const [sortCol,     setSortCol]     = useState('created_at')
  const [sortDir,     setSortDir]     = useState('desc')
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(false)
  const [confirm,     setConfirm]     = useState(null)
  const [categories,  setCategories]  = useState([])
  const [suppliers,   setSuppliers]   = useState([])
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

  /* Rediriger vers la page d'édition si ?edit=ID dans l'URL (ex: depuis dashboard) */
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (!editId) return
    navigate(`/produits/${editId}`)
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

      <div className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Produits</h1>
          <p className={s.pageSub}>{total.toLocaleString('fr-CH')} produit{total > 1 ? 's' : ''}</p>
        </div>
        <button className={s.btnPrimary} onClick={() => navigate('/produits/nouveau')}>
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
        onEdit={(product) => navigate(`/produits/${product.id}`)}
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
                <button className={s.iconBtn} onClick={() => navigate(`/produits/${product.id}`)} aria-label="Modifier">
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
