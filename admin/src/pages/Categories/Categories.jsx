import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  Plus, Edit2, Trash2, Tag, AlertTriangle, Check, X, ChevronRight, ChevronDown,
  Search, SlidersHorizontal, RotateCcw, Rows2, Rows3, PackageOpen, PackageSearch,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getCategories, createCategory, updateCategory, deleteCategory } from '../../services/categories.service.js'
import SortIcon from '../../components/ui/SortIcon/SortIcon.jsx'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog/ConfirmDialog.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import s from './Categories.module.css'

const schema = z.object({
  slug:      z.string().min(1, 'Slug requis').regex(/^[a-z0-9-]+$/, 'Minuscules, chiffres et tirets uniquement'),
  parentId:  z.preprocess(v => (v === '' || v == null ? null : Number(v)), z.number().int().nullable().optional()),
  sortOrder: z.coerce.number().int().min(0).optional(),
  nameFr:    z.string().min(1, 'Nom requis'),
  descFr:    z.string().optional(),
})

function toSlug(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/* ── Modale création / édition ── */
function CategoryModal({ category, categories, onClose, onSaved }) {
  const isEdit = !!category
  const [apiError, setApiError] = useState('')
  const [saved,    setSaved]    = useState(false)

  const { register, handleSubmit, setValue, watch, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: isEdit ? {
      slug:      category.slug         ?? '',
      parentId:  category.parent_id    ?? '',
      sortOrder: category.sort_order   ?? 0,
      nameFr:    category.translations?.fr?.name        ?? '',
      descFr:    category.translations?.fr?.description ?? '',
    } : { parentId: '', sortOrder: 0 },
  })

  const nameFr = watch('nameFr')
  const [slugTouched, setSlugTouched] = useState(isEdit)
  useEffect(() => {
    if (!slugTouched && nameFr) setValue('slug', toSlug(nameFr))
  }, [nameFr, slugTouched, setValue])

  const onSubmit = async (data) => {
    setApiError('')
    const payload = {
      slug:      data.slug,
      parentId:  data.parentId ? parseInt(data.parentId) : null,
      sortOrder: data.sortOrder ?? 0,
      translations: {
        fr: { name: data.nameFr, description: data.descFr || null },
      },
    }
    try {
      if (isEdit) {
        await updateCategory(category.id, payload)
      } else {
        await createCategory(payload)
      }
      setSaved(true)
      setTimeout(() => { onSaved(); onClose() }, 500)
    } catch (err) {
      if (!err.response) {
        setApiError('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.')
        return
      }

      const { status, data } = err.response
      /* Le backend renvoie "name" pour le nom FR — mappé sur le champ réel du formulaire */
      const FIELD_MAP = { name: 'nameFr' }
      const fieldErrors = data?.errors
      if (fieldErrors?.length) {
        fieldErrors.forEach(({ field, message }) => {
          const formField = FIELD_MAP[field] ?? field
          if (formField in schema.shape) setError(formField, { type: 'server', message })
        })
        /* Une erreur peut porter sur un champ hors formulaire (ex: translations.fr.description) —
           sans ce bandeau, le formulaire échouerait en silence et le bouton se contenterait
           de se réactiver, sans rien indiquer à l'utilisateur. */
        const unmapped = fieldErrors.filter(e => !((FIELD_MAP[e.field] ?? e.field) in schema.shape))
        setApiError(unmapped.length ? unmapped.map(e => e.message).join(' ') : '')
        return
      }

      if (status >= 500) {
        setApiError('Une erreur serveur est survenue. Veuillez réessayer dans un instant.')
      } else {
        setApiError(data?.message ?? 'Une erreur est survenue.')
      }
    }
  }

  /* Catégories pouvant servir de parent : niveaux 1 et 2 uniquement (un niveau 3 comme
     parent créerait un niveau 4, refusé par le backend). On exclut aussi la catégorie
     éditée elle-même et — en édition — ses propres descendants, pour éviter un cycle
     que le backend rejetterait de toute façon. */
  const depthOf = (cat) => {
    let depth = 0
    let current = cat
    while (current?.parent_id) {
      depth += 1
      current = categories.find(c => c.id === current.parent_id)
      if (!current) break
    }
    return depth
  }
  const isDescendantOf = (candidateId, ancestorId) => {
    let current = categories.find(c => c.id === candidateId)
    while (current?.parent_id) {
      if (current.parent_id === ancestorId) return true
      current = categories.find(c => c.id === current.parent_id)
    }
    return false
  }
  const parents = categories.filter(c => {
    if (c.id === category?.id) return false
    if (depthOf(c) >= 2) return false
    if (isEdit && isDescendantOf(c.id, category.id)) return false
    return true
  })
  const parentDepthLabel = (cat) => (depthOf(cat) === 1 ? '— ' : '')

  return (
    <div
      className={s.overlay}
      onClick={onClose}
      onKeyDown={e => e.key === 'Escape' && onClose()}
      tabIndex={-1}
    >
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.modalHead}>
          <h2 className={s.modalTitle}>
            {isEdit ? `Modifier — ${category.translations?.fr?.name ?? category.slug}` : 'Nouvelle catégorie'}
          </h2>
          <button className={s.closeBtn} onClick={onClose} aria-label="Fermer"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className={s.modalBody}>
          {apiError && (
            <div className={s.apiError}><AlertTriangle size={13} /> {apiError}</div>
          )}

          <div className={s.formGridStack}>
            <div className={s.field}>
              <label className={s.label}>Nom *</label>
              <input className={`${s.input} ${errors.nameFr ? s.inputError : ''}`} {...register('nameFr')} />
              {errors.nameFr && <span className={s.err}>{errors.nameFr.message}</span>}
            </div>
            <div className={s.field}>
              <label className={s.label}>Description</label>
              <textarea className={`${s.input} ${s.textarea}`} rows={4} {...register('descFr')} />
            </div>
          </div>

          <p className={s.sectionLabel}>Paramètres</p>
          <div className={s.formGrid2}>
            <div className={s.field}>
              <label className={s.label}>Slug URL *</label>
              <input
                className={`${s.input} ${errors.slug ? s.inputError : ''}`}
                {...register('slug')}
                onInput={() => setSlugTouched(true)}
                placeholder="ex: kits-broderie"
              />
              {errors.slug && <span className={s.err}>{errors.slug.message}</span>}
            </div>
            <div className={s.field}>
              <label className={s.label}>Catégorie parente</label>
              <select className={`${s.input} ${errors.parentId ? s.inputError : ''}`} {...register('parentId')}>
                <option value="">— Racine —</option>
                {parents.map(p => (
                  <option key={p.id} value={p.id}>
                    {parentDepthLabel(p)}{p.translations?.fr?.name ?? p.slug}
                  </option>
                ))}
              </select>
              {errors.parentId && <span className={s.err}>{errors.parentId.message}</span>}
            </div>
            <div className={s.field}>
              <label className={s.label}>Ordre d'affichage</label>
              <input type="number" min="0" className={s.input} {...register('sortOrder')} />
            </div>
          </div>

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

/* ── Panneau catégories — utilisé comme onglet dans la page Catégories & Tags ── */
function CategoriesPanel() {
  const toast = useToast()

  /* Recherche, filtres et tri vivent dans l'URL, comme sur la page Produits :
     Julie filtre, ouvre une catégorie, revient — et retrouve sa vue. Un lien
     peut aussi être mis en favori ou transmis tel quel. */
  const [searchParams, setSearchParams] = useSearchParams()
  const getParam = (key, fallback = '') => searchParams.get(key) ?? fallback

  /* Écrit dans l'URL en repartant TOUJOURS de l'URL courante : deux changements
     rapprochés (taper puis cocher) ne s'écrasent pas l'un l'autre. `replace`
     évite d'empiler une entrée d'historique par frappe. */
  const setParams = useCallback((changes) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(changes)) {
        if (value === '' || value === false || value === null || value === undefined) next.delete(key)
        else next.set(key, String(value))
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

  const [categories, setCategories] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(false)
  const [modal,      setModal]      = useState(null)
  const [confirm,    setConfirm]    = useState(null)
  const [expandedIds, setExpandedIds] = useState(new Set())

  /* Valeurs dérivées de l'URL — source de vérité unique */
  const search        = getParam('q')
  const sortCol       = getParam('sort', 'tree')
  const sortDir       = getParam('order', 'asc')
  const filterLevel   = getParam('level')
  const filterContent = getParam('content')   // 'empty' | 'filled'
  const filterReview  = getParam('review') === 'true'

  /* Le champ de recherche garde son propre état le temps de la frappe, l'URL
     n'étant mise à jour qu'après le debounce. */
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

  const activeFilterCount = useMemo(
    () => [filterLevel, filterContent].filter(v => v !== '').length + (filterReview ? 1 : 0),
    [filterLevel, filterContent, filterReview]
  )

  /* Réinitialise les filtres mais conserve la recherche en cours */
  const resetFilters = () => setParams({ level: '', content: '', review: '' })

  /* Popover des filtres — fermé à l'arrivée, même quand des filtres sont
     actifs : les puces les rendent déjà visibles. */
  const [showFilters, setShowFilters] = useState(false)
  const filterRef = useRef(null)

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

  /* Densité d'affichage — confort propre au poste, pas à la vue : elle n'a rien
     à faire dans l'URL (qui se partage) mais doit survivre au rechargement.
     localStorage peut lever (Safari en navigation privée) : lecture et écriture
     protégées, l'affichage restant correct sans. */
  const [dense, setDense] = useState(() => {
    try { return localStorage.getItem('categories:dense') === '1' } catch { return false }
  })
  const toggleDense = () => {
    setDense(v => {
      const next = !v
      try { localStorage.setItem('categories:dense', next ? '1' : '0') } catch { /* stockage indisponible */ }
      return next
    })
  }

  /* Raccourci « / » pour placer le curseur dans la recherche, sans le voler
     quand on saisit déjà ailleurs. */
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

  const toggleExpanded = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await getCategories({ limit: 200 })
      setCategories(res ?? [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = (id, canDelete) => {
    if (!canDelete) {
      toast.error('Impossible de supprimer : des produits ou sous-catégories sont encore rattachés à cette catégorie.')
      return
    }
    setConfirm({
      message: 'Supprimer cette catégorie ?',
      onConfirm: async () => {
        try {
          await deleteCategory(id)
          setCategories(prev => prev.filter(c => c.id !== id))
          toast.success('Catégorie supprimée.')
        } catch (err) {
          toast.error(err.response?.data?.message ?? 'Erreur lors de la suppression.')
        }
      },
    })
  }

  /* Index parent → enfants, construit une seule fois : le calcul de profondeur
     et le tri en arbre le parcourent à chaque rendu. */
  const byParent = useMemo(() => {
    const map = new Map()
    for (const c of categories) {
      const key = c.parent_id ?? null
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(c)
    }
    return map
  }, [categories])

  const byId = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  /* Profondeur d'une catégorie (0 = racine, 1 = enfant, 2 = petit-enfant).
     Le garde-fou `seen` évite une boucle infinie si la base contenait un cycle. */
  const depthOf = useCallback((cat) => {
    let depth = 0
    let current = cat
    const seen = new Set()
    while (current?.parent_id && !seen.has(current.id)) {
      seen.add(current.id)
      depth += 1
      current = byId.get(current.parent_id)
      if (!current) break
    }
    return depth
  }, [byId])

  const nameOf = (c) => c.translations?.fr?.name ?? c.slug

  /* Ordre d'affichage.
     Par défaut (« tree »), parcours en profondeur : chaque catégorie est suivie
     de ses descendants, ce qui est la seule lecture sensée d'une arborescence.
     Un tri par colonne casse volontairement cette hiérarchie pour répondre à la
     question posée (« quels rayons sont vides ? ») — l'indentation disparaît
     alors, sans quoi on lirait un arbre faux. */
  const sorted = useMemo(() => {
    if (sortCol !== 'tree') {
      const factor = sortDir === 'asc' ? 1 : -1
      const value = (c) => {
        if (sortCol === 'name')     return nameOf(c).toLowerCase()
        if (sortCol === 'slug')     return c.slug ?? ''
        if (sortCol === 'products') return Number(c.product_count) || 0
        if (sortCol === 'order')    return Number(c.sort_order) || 0
        return 0
      }
      return [...categories].sort((a, b) => {
        const va = value(a), vb = value(b)
        if (va < vb) return -1 * factor
        if (va > vb) return  1 * factor
        return nameOf(a).localeCompare(nameOf(b), 'fr')
      })
    }

    const result = []
    const visit = (parentId) => {
      for (const c of byParent.get(parentId) ?? []) {
        result.push(c)
        visit(c.id)
      }
    }
    visit(null)
    /* Filet de sécurité : catégories orphelines (parent_id pointant vers un id absent) */
    const inResult = new Set(result.map(c => c.id))
    result.push(...categories.filter(c => !inResult.has(c.id)))
    return result
  }, [categories, byParent, sortCol, sortDir])

  const isTreeView = sortCol === 'tree'

  const handleSort = (col) => {
    if (sortCol === col) {
      // Troisième clic : retour à l'arborescence, seule vue qui montre la hiérarchie
      if (sortDir === 'desc') { setParams({ sort: '', order: '' }); return }
      setParams({ sort: col, order: 'desc' })
      return
    }
    setParams({ sort: col, order: 'asc' })
  }

  const matchesQuery = (c, q) => (
    c.slug?.toLowerCase().includes(q) ||
    nameOf(c).toLowerCase().includes(q)
  )

  const query = search.trim().toLowerCase()

  /* Une catégorie passe-t-elle les filtres (hors recherche et hors accordéon) ? */
  const matchesFilters = useCallback((c) => {
    if (filterLevel && String(depthOf(c)) !== filterLevel) return false
    const count = Number(c.product_count) || 0
    if (filterContent === 'empty'  && count > 0) return false
    if (filterContent === 'filled' && count === 0) return false
    if (filterReview && !(Number(c.review_count) > 0)) return false
    return true
  }, [filterLevel, filterContent, filterReview, depthOf])

  /* Une catégorie a-t-elle un descendant qui satisfait recherche ET filtres ?
     Sert à garder visibles les ancêtres d'un résultat, pour qu'il reste
     atteignable dans l'arbre. */
  const hasMatchingDescendant = useCallback((catId) => {
    const children = byParent.get(catId) ?? []
    return children.some(child =>
      (matchesFilters(child) && (!query || matchesQuery(child, query))) ||
      hasMatchingDescendant(child.id)
    )
  }, [byParent, matchesFilters, query])

  const isSearching = !!query || activeFilterCount > 0

  /* Sans critère : accordéon — une catégorie n'est visible que si tous ses
     ancêtres sont dépliés. Avec critère : on montre ce qui correspond, plus les
     ancêtres nécessaires pour y accéder.
     Hors vue arborescente, l'accordéon n'a plus de sens : la liste est à plat. */
  const filtered = useMemo(() => {
    if (!isTreeView) {
      return sorted.filter(c => matchesFilters(c) && (!query || matchesQuery(c, query)))
    }
    if (isSearching) {
      return sorted.filter(c =>
        (matchesFilters(c) && (!query || matchesQuery(c, query))) || hasMatchingDescendant(c.id)
      )
    }
    return sorted.filter(c => !c.parent_id || expandedIds.has(c.parent_id))
  }, [sorted, isTreeView, isSearching, query, matchesFilters, hasMatchingDescendant, expandedIds])

  /* Libellés des filtres actifs, pour les puces */
  const activeChips = useMemo(() => {
    const chips = []
    if (filterLevel) {
      const labels = { 0: 'Rayon principal', 1: 'Sous-catégorie', 2: 'Sous-sous-catégorie' }
      chips.push({ key: 'level', label: 'Niveau', value: labels[filterLevel] ?? filterLevel })
    }
    if (filterContent) {
      chips.push({ key: 'content', label: 'Contenu', value: filterContent === 'empty' ? 'Vides' : 'Avec produits' })
    }
    if (filterReview) chips.push({ key: 'review', label: 'Classement', value: 'À reclasser' })
    return chips
  }, [filterLevel, filterContent, filterReview])

  /* Totaux affichés sous le titre — le nombre de rayons vides est l'information
     qui déclenche le plus souvent un rangement. */
  const emptyCount = useMemo(
    () => categories.filter(c => (Number(c.product_count) || 0) === 0).length,
    [categories]
  )

  return (
    <>
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
      {modal && (
        <CategoryModal
          category={modal === 'new' ? null : modal}
          categories={categories}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}

      <div className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Catégories</h1>
          <p className={s.pageSub}>
            {categories.length} catégorie{categories.length > 1 ? 's' : ''}
            {emptyCount > 0 && <> · {emptyCount} sans produit</>}
          </p>
        </div>
        <button className={s.btnPrimary} onClick={() => setModal('new')}>
          <Plus size={16} /> Nouvelle catégorie
        </button>
      </div>

      <div className={s.toolbar}>
        <div className={s.searchWrap}>
          <Search size={14} className={s.searchIcon} />
          <input
            ref={searchRef}
            type="search"
            className={s.searchInput}
            placeholder="Rechercher par nom ou slug…"
            value={searchInput}
            onChange={e => handleSearchChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape' && searchInput) { handleSearchChange(''); e.currentTarget.blur() } }}
          />
          <kbd className={s.searchKbd}>/</kbd>
        </div>

        {/* Raccourci vers la question posée le plus souvent : quels rayons sont
            vides et méritent d'être supprimés ou remplis ? */}
        <button
          className={`${s.quickFilter} ${filterContent === 'empty' ? s.quickFilterOn : ''}`}
          onClick={() => setParams({ content: filterContent === 'empty' ? '' : 'empty' })}
          aria-pressed={filterContent === 'empty'}
        >
          <PackageOpen size={13} /> Vides
        </button>

        {/* Rayons contenant des articles dont le classement reste à confirmer
            par la cliente (ADM-04) */}
        <button
          className={`${s.quickFilter} ${filterReview ? s.quickFilterOn : ''}`}
          onClick={() => setParams({ review: filterReview ? '' : 'true' })}
          aria-pressed={filterReview}
        >
          <AlertTriangle size={13} /> À reclasser
        </button>

        <div className={s.filterAnchor} ref={filterRef}>
          <button
            className={`${s.quickFilter} ${showFilters || activeFilterCount > 0 ? s.quickFilterOn : ''}`}
            onClick={() => setShowFilters(v => !v)}
            aria-expanded={showFilters}
            aria-haspopup="dialog"
          >
            <SlidersHorizontal size={13} /> Filtres
            {activeFilterCount > 0 && <span className={s.filterCount}>{activeFilterCount}</span>}
            <ChevronDown size={13} className={`${s.filterChevron} ${showFilters ? s.filterChevronOpen : ''}`} />
          </button>

          {showFilters && (
            <div className={s.filterPanel} role="dialog" aria-label="Filtres">
              <div className={s.filterGrid}>
                <div className={s.filterField}>
                  <label className={s.filterLabel} htmlFor="cat-level">Niveau</label>
                  <select
                    id="cat-level"
                    className={s.filter}
                    value={filterLevel}
                    onChange={e => setParams({ level: e.target.value })}
                  >
                    <option value="">Tous les niveaux</option>
                    <option value="0">Rayon principal</option>
                    <option value="1">Sous-catégorie</option>
                    <option value="2">Sous-sous-catégorie</option>
                  </select>
                </div>

                <div className={s.filterField}>
                  <label className={s.filterLabel} htmlFor="cat-content">Contenu</label>
                  <select
                    id="cat-content"
                    className={s.filter}
                    value={filterContent}
                    onChange={e => setParams({ content: e.target.value })}
                  >
                    <option value="">Toutes</option>
                    <option value="filled">Avec produits</option>
                    <option value="empty">Vides</option>
                  </select>
                </div>

                <div className={s.filterField}>
                  <span className={s.filterLabel}>Classement</span>
                  <label className={s.filterCheckbox}>
                    <input
                      type="checkbox"
                      checked={filterReview}
                      onChange={e => setParams({ review: e.target.checked ? 'true' : '' })}
                    />
                    Contient des articles à reclasser
                  </label>
                </div>
              </div>

              <div className={s.filterActions}>
                <button className={s.resetBtn} onClick={resetFilters} disabled={activeFilterCount === 0}>
                  <RotateCcw size={12} /> Réinitialiser
                </button>
                <button className={s.filterApplyBtn} onClick={() => setShowFilters(false)}>
                  Voir les {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
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
        </div>
      </div>

      {/* Puces des filtres actifs — rappellent ce qui est appliqué et se retirent
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

      {/* Le tri par colonne met la hiérarchie à plat : on le dit, sinon
          l'absence d'indentation passe pour un bug. */}
      {!isTreeView && (
        <p className={s.flatNotice}>
          Liste triée — l’arborescence est masquée.{' '}
          <button className={s.linkBtn} onClick={() => setParams({ sort: '', order: '' })}>
            Revenir à l’arborescence
          </button>
        </p>
      )}

      {error && <ErrorBanner onRetry={load} />}

      <div className={`${s.card} ${dense ? s.cardDense : ''}`}>
        <div className={s.tableHead}>
          <button className={s.sortHeader} onClick={() => handleSort('name')}>
            Catégorie <SortIcon col="name" sortCol={sortCol} sortDir={sortDir} />
          </button>
          <button className={s.sortHeader} onClick={() => handleSort('slug')}>
            Slug <SortIcon col="slug" sortCol={sortCol} sortDir={sortDir} />
          </button>
          <button className={s.sortHeader} onClick={() => handleSort('products')}>
            Produits <SortIcon col="products" sortCol={sortCol} sortDir={sortDir} />
          </button>
          <button className={s.sortHeader} onClick={() => handleSort('order')}>
            Ordre <SortIcon col="order" sortCol={sortCol} sortDir={sortDir} />
          </button>
          <span></span>
        </div>

        {loading ? (
          <div className={s.skeletonWrap}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={s.skeleton} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className={s.empty}>
            {isSearching ? (
              <>
                <p className={s.emptyTitle}>Aucune catégorie ne correspond</p>
                <p className={s.emptyText}>
                  Essayez un autre terme ou retirez les filtres appliqués.
                </p>
                <button className={s.resetBtn} onClick={() => { setParams({ q: '', level: '', content: '', review: '' }) }}>
                  <RotateCcw size={12} /> Effacer la recherche et les filtres
                </button>
              </>
            ) : (
              <>
                <p className={s.emptyTitle}>Aucune catégorie enregistrée</p>
                <p className={s.emptyText}>Créez un premier rayon pour ranger vos articles.</p>
                <button className={s.btnPrimary} onClick={() => setModal('new')}>
                  <Plus size={16} /> Nouvelle catégorie
                </button>
              </>
            )}
          </div>
        ) : (
          filtered.map(cat => {
            /* Hors vue arborescente, tout est à plat : pas d'indentation ni de
               chevrons, qui décriraient une hiérarchie que le tri a défaite. */
            const depth       = isTreeView ? depthOf(cat) : 0
            const isChild     = depth > 0
            const nameFr      = nameOf(cat)
            const hasChildren = isTreeView && (byParent.get(cat.id)?.length ?? 0) > 0
            const isExpanded  = isSearching ? true : expandedIds.has(cat.id)
            /* Compte agrégé sur toute la descendance, rayons secondaires inclus */
            const productCount = Number(cat.product_count) || 0
            const reviewCount  = Number(cat.review_count)  || 0
            const canDelete = productCount === 0 && (byParent.get(cat.id)?.length ?? 0) === 0

            return (
              <div key={cat.id} className={`${s.tableRow} ${isChild ? s.tableRowChild : ''}`}>
                <div className={`${s.catCell} ${isChild ? s.catCellChild : ''}`} style={isChild ? { paddingLeft: 22 * depth } : undefined}>
                  {hasChildren ? (
                    <button
                      type="button"
                      className={s.expandBtn}
                      onClick={() => toggleExpanded(cat.id)}
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? 'Masquer les sous-catégories' : 'Afficher les sous-catégories'}
                      disabled={isSearching}
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  ) : isChild ? (
                    <ChevronRight size={14} className={s.childArrow} />
                  ) : (
                    <span className={s.expandSpacer} />
                  )}
                  {!isChild && <div className={s.catIcon}><Tag size={13} /></div>}
                  <span className={`${s.catName} ${isChild ? s.catNameChild : ''}`}>{nameFr}</span>
                  {reviewCount > 0 && (
                    <span
                      className={s.reviewBadge}
                      title={`${reviewCount} article${reviewCount > 1 ? 's' : ''} dont le classement reste à confirmer`}
                    >
                      {reviewCount.toLocaleString('fr-CH')} à reclasser
                    </span>
                  )}
                </div>
                <span className={s.slug}>{cat.slug}</span>
                <span className={s.productCount} data-zero={productCount === 0 ? 'true' : 'false'}>
                  {productCount.toLocaleString('fr-CH')}
                </span>
                <span className={s.muted}>{cat.sort_order ?? 0}</span>
                <div className={s.actions}>
                  {/* Accès direct aux produits du rayon : le réflexe après avoir
                      repéré une catégorie vide ou à reclasser. */}
                  <Link
                    className={s.iconBtn}
                    to={`/produits?category_id=${cat.id}`}
                    aria-label={`Voir les produits de ${nameFr}`}
                    title="Voir les produits de cette catégorie"
                  >
                    <PackageSearch size={13} />
                  </Link>
                  <button className={s.iconBtn} onClick={() => setModal(cat)} aria-label="Modifier">
                    <Edit2 size={13} />
                  </button>
                  <button
                    className={s.iconBtnDanger}
                    onClick={() => handleDelete(cat.id, canDelete)}
                    disabled={!canDelete}
                    aria-label="Supprimer"
                    title={canDelete ? 'Supprimer' : 'Impossible : des produits ou sous-catégories sont encore rattachés'}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </>
  )
}

/* ── Page principale ── */
export default function Categories() {
  return (
    <div className={s.page}>
      <CategoriesPanel />
    </div>
  )
}
