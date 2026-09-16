import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import {
  Plus, Search, Edit2, Trash2, ImageOff, AlertTriangle,
  SlidersHorizontal, RotateCcw, EyeOff, X, Rows2, Rows3, Star, ChevronDown,
} from 'lucide-react'
import {
  getProducts, deleteProduct, getBrands,
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
import { useSavedViews } from '../../hooks/useSavedViews.js'
import s from './Products.module.css'

/* Nombre de produits par page — ajustable depuis la barre d'outils.
   20 reste le défaut (page légère) ; 50 et 100 servent à balayer une gamme
   entière sans enchaîner les pages, sur un catalogue de ~15 000 références. */
const DEFAULT_LIMIT = 20
const PER_PAGE_OPTIONS = [20, 50, 100]


// ── Page principale ────────────────────────────────────────────────────────
export default function Products() {
  const toast = useToast()
  const navigate = useNavigate()

  /* Recherche, filtres, tri et page vivent dans l'URL, pas dans des useState.
     Julie travaille sur 15 000 références : elle filtre, ouvre une fiche, revient.
     Avec un état local, ce retour repartait de zéro et il fallait tout refiltrer.
     En passant par l'URL, le bouton Retour du navigateur restaure la vue, un
     rafraîchissement ne perd rien, et une recherche récurrente (« stock bas chez
     tel fournisseur ») peut être mise en favori ou transmise telle quelle. */
  const [searchParams, setSearchParams] = useSearchParams()

  const getParam = (key, fallback = '') => searchParams.get(key) ?? fallback

  /* Écrit dans l'URL en repartant TOUJOURS de l'URL courante plutôt que d'une
     copie figée : deux changements rapprochés (taper puis cocher) ne s'écrasent
     pas l'un l'autre. `replace` évite d'empiler une entrée d'historique par
     frappe — sinon le bouton Retour rejouerait la saisie lettre par lettre. */
  const setParams = useCallback((changes, { resetPage = true } = {}) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(changes)) {
        // '' / false / null = valeur par défaut : on retire la clé pour garder une URL lisible
        if (value === '' || value === false || value === null || value === undefined) next.delete(key)
        else next.set(key, String(value))
      }
      if (resetPage) next.delete('page')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const [products,    setProducts]    = useState([])
  /* Résultats approchés : la recherche exacte n'a rien donné et le serveur a
     élargi les termes (repli anti-faute, voir product.admin.repository.js). */
  const [isFuzzy,     setIsFuzzy]     = useState(false)
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(false)
  const [confirm,     setConfirm]     = useState(null)
  const [categories,  setCategories]  = useState([])
  const [suppliers,   setSuppliers]   = useState([])
  const [brands,      setBrands]      = useState([])

  /* Valeurs dérivées de l'URL — source de vérité unique */
  const page           = Math.max(1, parseInt(getParam('page', '1'), 10) || 1)
  const search         = getParam('q')
  const sortCol        = getParam('sort', 'created_at')
  const sortDir        = getParam('order', 'desc')
  const perPage        = Math.min(100, Math.max(10, parseInt(getParam('limit', String(DEFAULT_LIMIT)), 10) || DEFAULT_LIMIT))
  const filterCat      = getParam('category_id')
  const filterSupplier = getParam('supplier_id')
  const filterBrand    = getParam('brand')
  const filterMinPrice = getParam('min_price')
  const filterMaxPrice = getParam('max_price')
  const filterInStock  = getParam('in_stock')  === 'true'
  /* Stock bas : articles actifs à 5 unités ou moins — sert au réassort fournisseur */
  const filterLowStock = getParam('low_stock') === 'true'
  const filterIsActive = getParam('is_active')
  const filterFeatured = getParam('is_featured')

  /* Le champ de recherche garde son propre état le temps de la frappe : l'URL
     n'est mise à jour qu'après le debounce, sinon chaque lettre relancerait une
     requête sur 15 000 produits. */
  const [searchInput, setSearchInput] = useState(search)
  const searchTimer = useRef(null)
  const handleSearchChange = (value) => {
    setSearchInput(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setParams({ q: value }), 300)
  }
  /* Resynchronise le champ quand l'URL change sans passer par la frappe
     (bouton Retour, clic sur « Effacer », arrivée depuis un lien). */
  useEffect(() => { setSearchInput(search) }, [search])
  useEffect(() => () => clearTimeout(searchTimer.current), [])

  const setPage = useCallback((p) => setParams({ page: p > 1 ? p : '' }, { resetPage: false }), [setParams])

  const activeFilterCount = useMemo(
    () => [filterCat, filterSupplier, filterBrand, filterMinPrice, filterMaxPrice, filterIsActive, filterFeatured].filter(v => v !== '').length
      + (filterInStock ? 1 : 0) + (filterLowStock ? 1 : 0),
    [filterCat, filterSupplier, filterBrand, filterMinPrice, filterMaxPrice, filterInStock, filterLowStock, filterIsActive, filterFeatured]
  )

  /* Réinitialise les filtres mais conserve la recherche en cours : effacer les
     filtres ne doit pas faire perdre le terme déjà tapé. */
  const resetFilters = () => setParams({
    category_id: '', supplier_id: '', brand: '', min_price: '', max_price: '',
    in_stock: '', low_stock: '', is_active: '', is_featured: '',
  })

  /* Popover des filtres avancés. Fermé à l'arrivée, même quand des filtres sont
     actifs : les puces les rendent déjà visibles, et garder le panneau ouvert
     masquait la moitié du tableau. */
  const [showFilters, setShowFilters] = useState(false)
  const filterRef = useRef(null)

  /* Fermeture au clic extérieur et à Échap — attendu de tout popover.
     `mousedown` plutôt que `click` : le popover doit disparaître dès l'appui,
     pas au relâchement. */
  useEffect(() => {
    if (!showFilters) return
    const onPointerDown = (e) => {
      if (!filterRef.current?.contains(e.target)) setShowFilters(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setShowFilters(false) }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showFilters])

  /* Densité d'affichage — préférence de confort propre au poste, pas à la vue :
     elle n'a donc rien à faire dans l'URL (qui se partage), mais doit survivre
     au rechargement. Le mode compact fait tenir environ deux fois plus de lignes
     à l'écran, ce qui change tout quand on balaye une gamme.
     localStorage peut lever (Safari en navigation privée) : on protège lecture
     et écriture, l'affichage restant correct sans. */
  const [dense, setDense] = useState(() => {
    try { return localStorage.getItem('products:dense') === '1' } catch { return false }
  })
  const toggleDense = () => {
    setDense(v => {
      const next = !v
      try { localStorage.setItem('products:dense', next ? '1' : '0') } catch { /* stockage indisponible */ }
      return next
    })
  }

  /* ── Vues enregistrées ────────────────────────────────────────────────── */
  const { views, saveView, removeView, maxViews } = useSavedViews()
  const [naming, setNaming] = useState(false)
  const nameRef = useRef(null)

  const currentQuery = searchParams.toString()
  const hasCriteria  = activeFilterCount > 0 || !!search
  /* Une vue est « active » quand l'URL courante porte exactement ses critères.
     On compare des ensembles de paramètres et non les chaînes brutes : l'ordre
     des clés varie selon l'ordre des clics, et `page` ne fait pas partie de
     l'identité d'une vue (la page 3 de « Réassort DMC » reste cette vue). */
  const sameCriteria = useCallback((queryA, queryB) => {
    const normalize = (q) => {
      const params = new URLSearchParams(q)
      params.delete('page')
      const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
      return JSON.stringify(entries)
    }
    return normalize(queryA) === normalize(queryB)
  }, [])

  const activeView = useMemo(
    () => views.find(v => sameCriteria(v.query, currentQuery)) ?? null,
    [views, currentQuery, sameCriteria]
  )

  const handleSaveView = (e) => {
    e.preventDefault()
    const value = nameRef.current?.value ?? ''
    if (!value.trim()) return
    saveView(value, currentQuery)
    setNaming(false)
    toast.success(`Vue « ${value.trim()} » enregistrée.`)
  }

  /* Dernière vue consultée — restaurée à l'arrivée sur la page quand aucun
     critère n'est passé dans l'URL. Julie reprend souvent son travail là où elle
     l'a laissé (un réassort en cours), et retaper les filtres à chaque session
     était une perte de temps.
     Ne s'applique qu'à une arrivée « nue » : un lien partagé, un favori ou un
     retour arrière portent leurs propres critères et doivent primer. */
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    if (currentQuery) return // l'URL a déjà des critères : on ne touche à rien
    try {
      const last = localStorage.getItem('products:lastQuery')
      if (last) setSearchParams(new URLSearchParams(last), { replace: true })
    } catch { /* stockage indisponible */ }
  }, [currentQuery, setSearchParams])

  /* Mémorise les critères courants (hors pagination, qui n'a pas à être rejouée) */
  useEffect(() => {
    if (!restoredRef.current) return
    try {
      const params = new URLSearchParams(currentQuery)
      params.delete('page')
      const value = params.toString()
      if (value) localStorage.setItem('products:lastQuery', value)
      else localStorage.removeItem('products:lastQuery')
    } catch { /* stockage indisponible */ }
  }, [currentQuery])

  /* Raccourci « / » pour placer le curseur dans la recherche, sans le voler
     quand on est déjà en train de saisir ailleurs. */
  const searchRef = useRef(null)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* Libellés des filtres actifs — résolus après le chargement des listes de
     référence, d'où le repli sur l'identifiant tant qu'elles n'ont pas répondu. */
  const activeChips = useMemo(() => {
    const chips = []
    if (filterCat) {
      chips.push({ key: 'category_id', label: 'Catégorie',
        // Le nom est stocké brut : plus de tirets d'indentation à retirer ici
        value: categories.find(c => String(c.id) === filterCat)?.name ?? filterCat })
    }
    if (filterSupplier) {
      chips.push({ key: 'supplier_id', label: 'Fournisseur',
        value: suppliers.find(sup => String(sup.id) === filterSupplier)?.name ?? filterSupplier })
    }
    if (filterBrand)    chips.push({ key: 'brand',       label: 'Marque',  value: filterBrand })
    if (filterMinPrice) chips.push({ key: 'min_price',   label: 'Prix min', value: `CHF ${filterMinPrice}` })
    if (filterMaxPrice) chips.push({ key: 'max_price',   label: 'Prix max', value: `CHF ${filterMaxPrice}` })
    if (filterInStock)  chips.push({ key: 'in_stock',    label: 'Stock',   value: 'En stock' })
    if (filterLowStock) chips.push({ key: 'low_stock',   label: 'Stock',   value: 'Bas (≤ 5)' })
    if (filterIsActive) chips.push({ key: 'is_active',   label: 'Statut',  value: filterIsActive === 'true' ? 'Actif' : 'Inactif' })
    if (filterFeatured) chips.push({ key: 'is_featured', label: 'Vitrine', value: filterFeatured === 'true' ? 'Mis en avant' : 'Non mis en avant' })
    return chips
  }, [filterCat, filterSupplier, filterBrand, filterMinPrice, filterMaxPrice, filterInStock, filterLowStock, filterIsActive, filterFeatured, categories, suppliers])

  /* Catégories parentes pour le groupe optgroup */
  const parentCats = useMemo(() => categories.filter(c => !c.parentId), [categories])

  /* Toute la descendance d'un rayon, et pas seulement ses enfants directs.
     Auparavant les catégories de niveau 3 (« Mouliné Spécial », « Point de croix
     compté »…) n'apparaissaient nulle part dans le filtre : impossible de s'en
     servir alors qu'elles existent en base. `depth` sert à les indenter pour
     qu'on lise à quel niveau on se trouve. */
  const descendantsOf = useCallback((parentId, depth = 1) => {
    const out = []
    for (const child of categories.filter(c => c.parentId === parentId)) {
      out.push({ ...child, depth })
      out.push(...descendantsOf(child.id, depth + 1))
    }
    return out
  }, [categories])

  /* Chargement des listes de référence (catégories, fournisseurs, TVA) */
  useEffect(() => {
    /* getCategories() retourne directement [] */
    getCategories().then(list => {
      const raw = list.map(c => ({
        id:       c.id,
        parentId: c.parent_id ?? null,
        name:     c.translations?.fr?.name ?? c.slug,
      }))
      /* Ordre hiérarchique (parcours en profondeur, jusqu'à 3 niveaux) : chaque
         catégorie est suivie de ses descendants. Le NOM reste brut — c'est à
         l'affichage de décider de son indentation, le filtre regroupant déjà par
         <optgroup> et les puces n'ayant aucune indentation à montrer.
         La version précédente ne parcourait que deux niveaux et rejetait les
         catégories de niveau 3 en fin de liste, sous le mauvais parent. */
      const byParent = new Map()
      for (const c of raw) {
        const key = c.parentId ?? null
        if (!byParent.has(key)) byParent.set(key, [])
        byParent.get(key).push(c)
      }
      const sorted = []
      const visit = (parentId, depth) => {
        for (const c of byParent.get(parentId) ?? []) {
          sorted.push({ ...c, depth })
          visit(c.id, depth + 1)
        }
      }
      visit(null, 0)
      /* Filet de sécurité : une catégorie dont le parent a disparu ne doit pas
         être absente du filtre — elle est ajoutée à la fin. */
      const placed = new Set(sorted.map(c => c.id))
      sorted.push(...raw.filter(c => !placed.has(c.id)).map(c => ({ ...c, depth: 0 })))
      setCategories(sorted)
    }).catch(() => {})

    /* getSuppliers() retourne { data: [], pagination: {} } */
    getSuppliers({ limit: 100 }).then(({ data }) => setSuppliers(data)).catch(() => {})

    /* Marques / éditeurs — filtre demandé pour travailler gamme par gamme (ex. DMC Art.117) */
    getBrands().then(setBrands).catch(() => {})
  }, [])

  const handleSort = (col) => {
    const newDir = sortCol === col ? (sortDir === 'asc' ? 'desc' : 'asc') : 'desc'
    setParams({ sort: col, order: newDir })
  }

  const [refreshTick, setRefreshTick] = useState(0)
  const load = () => setRefreshTick(t => t + 1)


  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setError(false)
      setLoading(true)
      try {
        const params = { page, limit: perPage, sort: sortCol, order: sortDir }
        if (search)            params.q           = search
        if (filterCat)         params.category_id = filterCat
        if (filterSupplier)    params.supplier_id = filterSupplier
        if (filterBrand)       params.brand       = filterBrand
        if (filterMinPrice)    params.min_price   = filterMinPrice
        if (filterMaxPrice)    params.max_price   = filterMaxPrice
        if (filterInStock)     params.in_stock    = 'true'
        if (filterLowStock)    params.low_stock   = 'true'
        if (filterIsActive)    params.is_active   = filterIsActive
        if (filterFeatured)    params.is_featured = filterFeatured
        const res = await getProducts(params)
        if (!cancelled) {
          setProducts(res.data ?? [])
          setIsFuzzy(Boolean(res.isFuzzy))
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
  }, [page, perPage, search, filterCat, filterSupplier, filterBrand, filterMinPrice, filterMaxPrice, filterInStock, filterLowStock, filterIsActive, filterFeatured, sortCol, sortDir, refreshTick])

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

  const totalPages = Math.ceil(total / perPage)

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
            ref={searchRef}
            type="search"
            className={s.searchInput}
            placeholder="Nom, référence, fournisseur ou marque…"
            value={searchInput}
            onChange={e => handleSearchChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape' && searchInput) { handleSearchChange(''); e.currentTarget.blur() } }}
          />
          {/* Raccourci clavier : la recherche est le premier geste de presque
              chaque visite sur un catalogue de cette taille. */}
          <kbd className={s.searchKbd}>/</kbd>
        </div>

        {/* Raccourcis vers les deux vues les plus utilisées — évitent d'ouvrir
            le panneau de filtres pour les tâches quotidiennes (réassort, brouillons). */}
        <button
          className={`${s.quickFilter} ${filterLowStock ? s.quickFilterOn : ''}`}
          onClick={() => setParams({ low_stock: filterLowStock ? '' : 'true', in_stock: '' })}
          aria-pressed={filterLowStock}
        >
          <AlertTriangle size={13} /> Stock bas
        </button>
        <button
          className={`${s.quickFilter} ${filterIsActive === 'false' ? s.quickFilterOn : ''}`}
          onClick={() => setParams({ is_active: filterIsActive === 'false' ? '' : 'false' })}
          aria-pressed={filterIsActive === 'false'}
        >
          <EyeOff size={13} /> Inactifs
        </button>

        {/* Filtres avancés en popover ancré au bouton, et non en panneau poussant
            la page : ouvert en permanence, il repoussait le tableau à 540 px du
            haut et ne laissait voir que 9 produits. Il se ferme dès qu'on a
            choisi, la liste reprend toute la place. */}
        <div className={s.filterAnchor} ref={filterRef}>
          <button
            className={`${s.quickFilter} ${showFilters || activeFilterCount > 0 ? s.quickFilterOn : ''}`}
            onClick={() => setShowFilters(v => !v)}
            aria-expanded={showFilters}
            aria-haspopup="dialog"
          >
            <SlidersHorizontal size={13} />
            Filtres
            {activeFilterCount > 0 && (
              <span className={s.filterBadge}>{activeFilterCount}</span>
            )}
            <ChevronDown size={13} className={`${s.filterChevron} ${showFilters ? s.filterChevronOpen : ''}`} />
          </button>

        {showFilters && (
          <div className={s.filterPanel} role="dialog" aria-label="Filtres">
            <div className={s.filterGrid}>

              {/* Catégorie avec sous-catégories */}
              <div className={s.filterField}>
                <label className={s.filterLabel}>Catégorie</label>
                <select
                  className={s.filterSelect}
                  value={filterCat}
                  onChange={e => setParams({ category_id: e.target.value })}
                >
                  <option value="">Toutes</option>
                  {parentCats.map(p => (
                    <optgroup key={p.id} label={p.name}>
                      <option value={p.id}>{p.name} (tout)</option>
                      {descendantsOf(p.id).map(ch => (
                        <option key={ch.id} value={ch.id}>
                          {' '.repeat(ch.depth * 2)}{ch.name}
                        </option>
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
                  onChange={e => setParams({ supplier_id: e.target.value })}
                >
                  <option value="">Tous</option>
                  {suppliers.map(sup => (
                    <option key={sup.id} value={sup.id}>{sup.name}</option>
                  ))}
                </select>
              </div>

              {/* Marque / éditeur — permet de travailler gamme par gamme (ex. « DMC Art.117 »),
                  ce que la catégorie seule ne permet pas : une même gamme est répartie
                  sur plusieurs catégories. */}
              <div className={s.filterField}>
                <label className={s.filterLabel}>Marque</label>
                <select
                  className={s.filterSelect}
                  value={filterBrand}
                  onChange={e => setParams({ brand: e.target.value })}
                >
                  <option value="">Toutes</option>
                  {brands.map(b => (
                    <option key={b} value={b}>{b}</option>
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
                  onChange={e => setParams({ min_price: e.target.value })}
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
                  onChange={e => setParams({ max_price: e.target.value })}
                />
              </div>

              {/* Statut */}
              <div className={s.filterField}>
                <label className={s.filterLabel}>Statut</label>
                <select
                  className={s.filterSelect}
                  value={filterIsActive}
                  onChange={e => setParams({ is_active: e.target.value })}
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
                  onChange={e => setParams({ is_featured: e.target.value })}
                >
                  <option value="">Tous</option>
                  <option value="true">Mis en avant</option>
                  <option value="false">Non</option>
                </select>
              </div>

              {/* Stock — « en stock » et « stock bas » s'excluent : cocher l'un décoche
                  l'autre, une combinaison des deux ne renverrait presque rien. */}
              <div className={s.filterField}>
                <label className={s.filterLabel}>Stock</label>
                <label className={s.filterCheckbox}>
                  <input
                    type="checkbox"
                    checked={filterInStock}
                    onChange={e => setParams({ in_stock: e.target.checked ? 'true' : '', low_stock: '' })}
                  />
                  En stock uniquement
                </label>
                {/* Croisé avec le filtre Fournisseur : donne la liste de ce qu'il faut
                    recommander chez un fournisseur donné. */}
                <label className={s.filterCheckbox}>
                  <input
                    type="checkbox"
                    checked={filterLowStock}
                    onChange={e => setParams({ low_stock: e.target.checked ? 'true' : '', in_stock: '' })}
                  />
                  Stock bas (≤ 5)
                </label>
              </div>

            </div>

            {/* Pied du popover : « Tout effacer » n'apparaît que s'il y a quelque
                chose à effacer, et « Voir les résultats » referme le popover pour
                rendre la place au tableau. */}
            <div className={s.filterActions}>
              {activeFilterCount > 0 && (
                <button className={s.filterClearBtn} onClick={resetFilters}>
                  <RotateCcw size={12} /> Tout effacer
                </button>
              )}
              <button className={s.filterApplyBtn} onClick={() => setShowFilters(false)}>
                Voir les {total.toLocaleString('fr-CH')} résultat{total > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}
        </div>

        <div className={s.toolbarRight}>
          <button
            className={s.densityBtn}
            onClick={toggleDense}
            aria-pressed={dense}
            title={dense ? 'Affichage confortable' : 'Affichage compact — plus de lignes à l’écran'}
          >
            {dense ? <Rows3 size={15} /> : <Rows2 size={15} />}
          </button>
          <label className={s.perPageLabel}>
            Afficher
            <select
              className={s.perPageSelect}
              value={perPage}
              onChange={e => setParams({ limit: Number(e.target.value) === DEFAULT_LIMIT ? '' : e.target.value })}
            >
              {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* ── Vues enregistrées ──
          Recherches récurrentes rappelées en un clic (« Réassort DMC »,
          « Brouillons »). Conservées sur le poste : c'est un confort de travail,
          pas une donnée métier à synchroniser. */}
      {(views.length > 0 || hasCriteria) && (
        <div className={s.views}>
          <Star size={13} className={s.viewsIcon} />
          {views.map(view => (
            <span
              key={view.name}
              className={`${s.view} ${activeView?.name === view.name ? s.viewActive : ''}`}
            >
              <button
                className={s.viewBtn}
                onClick={() => setSearchParams(new URLSearchParams(view.query))}
              >
                {view.name}
              </button>
              <button
                className={s.viewRemove}
                onClick={() => removeView(view.name)}
                aria-label={`Supprimer la vue ${view.name}`}
                title="Supprimer cette vue"
              >
                <X size={11} />
              </button>
            </span>
          ))}

          {/* Proposé seulement s'il y a quelque chose à enregistrer et que la vue
              n'existe pas déjà à l'identique */}
          {hasCriteria && !activeView && (
            naming ? (
              <form className={s.viewForm} onSubmit={handleSaveView}>
                <input
                  ref={nameRef}
                  autoFocus
                  className={s.viewInput}
                  placeholder="Nom de la vue…"
                  maxLength={32}
                  onKeyDown={e => { if (e.key === 'Escape') setNaming(false) }}
                  onBlur={() => setNaming(false)}
                />
              </form>
            ) : (
              <button
                className={s.viewAdd}
                onClick={() => setNaming(true)}
                disabled={views.length >= maxViews}
                title={views.length >= maxViews ? `Maximum ${maxViews} vues` : 'Enregistrer cette recherche'}
              >
                <Plus size={12} /> Enregistrer la vue
              </button>
            )
          )}
        </div>
      )}

      {/* Puces des filtres actifs — le compteur seul ne disait pas LESQUELS
          étaient appliqués : il fallait rouvrir le panneau pour le savoir, et un
          filtre oublié faisait croire à un catalogue vide. Chaque puce se retire
          d'un clic. */}
      {activeFilterCount > 0 && (
        <div className={s.chips}>
          {activeChips.map(chip => (
            <button key={chip.key} className={s.chip} onClick={() => setParams({ [chip.key]: '' })}>
              <span className={s.chipLabel}>{chip.label}</span>
              <span className={s.chipValue}>{chip.value}</span>
              <X size={12} className={s.chipX} />
            </button>
          ))}
          <button className={s.chipReset} onClick={resetFilters}>
            <RotateCcw size={12} /> Tout effacer
          </button>
        </div>
      )}


      {error && <ErrorBanner onRetry={load} />}

      <div className={`${s.card} ${dense ? s.cardDense : ''}`}>
        <div className={s.tableHead}>
          {/* Tri alphabétique : déjà accepté par l'API (whitelist `name`), il
              n'était simplement pas proposé dans l'interface. */}
          <button className={s.sortHeader} onClick={() => handleSort('name')}>
            Produit <SortIcon col="name" sortCol={sortCol} sortDir={sortDir} />
          </button>
          <span>Marque</span>
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

        {/* Recherche approchée : ne pas laisser croire à une correspondance exacte */}
        {!loading && isFuzzy && search && (
          <p className={s.fuzzyNotice} role="status">
            Aucun résultat exact pour «&nbsp;{search}&nbsp;» — voici des articles proches.
          </p>
        )}

        {loading ? (
          <SkeletonTable rows={8} cols={7} />
        ) : products.length === 0 ? (
          /* Liste vide : le catalogue compte 15 000 références, donc un écran vide
             vient presque toujours d'un filtre trop restrictif — souvent un filtre
             oublié d'une recherche précédente. On rappelle ce qui est appliqué et
             on offre la sortie, au lieu d'un « Aucun produit trouvé » sans issue. */
          <div className={s.empty}>
            <p className={s.emptyTitle}>Aucun produit ne correspond.</p>
            {(activeFilterCount > 0 || search) && (
              <>
                <p className={s.emptyHint}>
                  {search && <>Recherche « <strong>{search}</strong> »</>}
                  {search && activeFilterCount > 0 && ' et '}
                  {activeFilterCount > 0 && (
                    <>{activeFilterCount} filtre{activeFilterCount > 1 ? 's' : ''} actif{activeFilterCount > 1 ? 's' : ''}</>
                  )}
                  .
                </p>
                <div className={s.emptyActions}>
                  {activeFilterCount > 0 && (
                    <button className={s.emptyBtn} onClick={resetFilters}>
                      <RotateCcw size={13} /> Effacer les filtres
                    </button>
                  )}
                  {search && (
                    <button className={s.emptyBtn} onClick={() => handleSearchChange('')}>
                      <X size={13} /> Effacer la recherche
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
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
                <div className={s.productInfo}>
                  {/* Vrai lien, et non un onClick : la fiche s'ouvre dans un nouvel
                      onglet au Cmd/Ctrl+clic ou au clic-milieu, et se parcourt au
                      clavier. Il s'étire sur toute la ligne via ::after, ce qui
                      rend l'ensemble cliquable sans imbriquer les boutons d'action
                      dans une zone cliquable. */}
                  <Link to={`/produits/${product.id}`} className={s.productLink}>
                    {product.name}
                  </Link>
                  <p className={s.productMeta}>
                    {product.category_name && <span>{product.category_name}</span>}
                    {product.category_name && product.supplier_name && <span className={s.metaSep}>·</span>}
                    {product.supplier_name && <span className={s.supplierTag}>{product.supplier_name}</span>}
                  </p>
                </div>
              </div>
              {/* Marque cliquable : un clic filtre sur toute la gamme. C'est le
                  geste « voir les autres produits comme celui-ci », qui demandait
                  sinon d'ouvrir le panneau et de chercher dans une liste de 80. */}
              {product.brand ? (
                <button
                  className={s.brandCell}
                  onClick={() => setParams({ brand: product.brand })}
                  title={`Filtrer sur ${product.brand}`}
                >
                  {product.brand}
                </button>
              ) : (
                <span className={s.brandEmpty}>—</span>
              )}
              <span className={s.sku}>{product.sku ?? '—'}</span>
              <span className={s.bold}>{formatCHF(product.price_chf)}</span>
              {/* Stock bas signalé par la seule couleur : l'icône d'alerte répétée
                  sur chaque ligne saturait la colonne sans rien ajouter. */}
              <span className={product.stock <= 5 ? s.stockLow : s.stockOk}>
                {product.stock}
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

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={total} perPage={perPage} />
    </div>
  )
}
