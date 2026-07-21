import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Edit2, Trash2, Tag, Tags as TagsIcon, AlertTriangle, Check, X, ChevronRight, ChevronDown, Search } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getCategories, createCategory, updateCategory, deleteCategory } from '../../services/categories.service.js'
import { TagsPanel } from '../Tags/Tags.jsx'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog/ConfirmDialog.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import s from './Categories.module.css'

const schema = z.object({
  slug:      z.string().min(1, 'Slug requis').regex(/^[a-z0-9-]+$/, 'Minuscules, chiffres et tirets uniquement'),
  parentId:  z.preprocess(v => (v === '' || v == null ? null : Number(v)), z.number().int().nullable().optional()),
  sortOrder: z.coerce.number().int().min(0).optional(),
  nameFr:    z.string().min(1, 'Nom FR requis'),
  nameDe:    z.string().optional(),
  nameEn:    z.string().optional(),
  descFr:    z.string().optional(),
  descDe:    z.string().optional(),
  descEn:    z.string().optional(),
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
      nameDe:    category.translations?.de?.name        ?? '',
      nameEn:    category.translations?.en?.name        ?? '',
      descFr:    category.translations?.fr?.description ?? '',
      descDe:    category.translations?.de?.description ?? '',
      descEn:    category.translations?.en?.description ?? '',
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
        ...(data.nameDe ? { de: { name: data.nameDe, description: data.descDe || null } } : {}),
        ...(data.nameEn ? { en: { name: data.nameEn, description: data.descEn || null } } : {}),
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

          <p className={s.sectionLabel}>Noms</p>
          <div className={s.formGrid3}>
            <div className={s.field}>
              <label className={s.label}>Nom FR *</label>
              <input className={`${s.input} ${errors.nameFr ? s.inputError : ''}`} {...register('nameFr')} />
              {errors.nameFr && <span className={s.err}>{errors.nameFr.message}</span>}
            </div>
            <div className={s.field}>
              <label className={s.label}>Nom DE</label>
              <input className={s.input} {...register('nameDe')} placeholder="Deutsch" />
            </div>
            <div className={s.field}>
              <label className={s.label}>Nom EN</label>
              <input className={s.input} {...register('nameEn')} placeholder="English" />
            </div>
          </div>

          <p className={s.sectionLabel}>Descriptions</p>
          <div className={s.formGridStack}>
            <div className={s.field}>
              <label className={s.label}>Description FR</label>
              <textarea className={`${s.input} ${s.textarea}`} rows={4} {...register('descFr')} />
            </div>
            <div className={s.field}>
              <label className={s.label}>Description DE</label>
              <textarea className={`${s.input} ${s.textarea}`} rows={4} {...register('descDe')} />
            </div>
            <div className={s.field}>
              <label className={s.label}>Description EN</label>
              <textarea className={`${s.input} ${s.textarea}`} rows={4} {...register('descEn')} />
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
  const [categories, setCategories] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(false)
  const [modal,      setModal]      = useState(null)
  const [confirm,    setConfirm]    = useState(null)
  const [search,     setSearch]     = useState('')
  const [expandedIds, setExpandedIds] = useState(new Set())
  const debounceRef = useRef(null)

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

  const handleDelete = (id) => {
    setConfirm({
      message: 'Supprimer cette catégorie ? Les produits liés ne seront pas supprimés.',
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

  /* Profondeur d'une catégorie dans la hiérarchie (0 = racine, 1 = enfant, 2 = petit-enfant) */
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

  /* Tri en profondeur (DFS) : chaque catégorie est suivie immédiatement de ses descendants,
     ce qui généralise l'ancien tri "parent puis enfants" à un nombre de niveaux quelconque */
  const sorted = (() => {
    const byParent = new Map()
    for (const c of categories) {
      const key = c.parent_id ?? null
      if (!byParent.has(key)) byParent.set(key, [])
      byParent.get(key).push(c)
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
  })()

  const matchesQuery = (c, q) => (
    c.slug?.toLowerCase().includes(q) ||
    c.translations?.fr?.name?.toLowerCase().includes(q) ||
    c.translations?.de?.name?.toLowerCase().includes(q) ||
    c.translations?.en?.name?.toLowerCase().includes(q)
  )

  const query = search.trim().toLowerCase()

  /* Une catégorie a-t-elle un descendant (à n'importe quelle profondeur) qui matche la recherche ? */
  const hasMatchingDescendant = (catId, q) => {
    const directChildren = sorted.filter(c => c.parent_id === catId)
    return directChildren.some(child => matchesQuery(child, q) || hasMatchingDescendant(child.id, q))
  }

  /* Sans recherche : accordéon — une catégorie n'est visible que si tous ses ancêtres sont dépliés.
     Avec recherche : filtre sur tous les niveaux, en gardant visibles les ancêtres d'une
     sous-catégorie trouvée pour qu'elle reste accessible dans l'arbre. */
  const filtered = query
    ? sorted.filter(c => matchesQuery(c, query) || hasMatchingDescendant(c.id, query))
    : sorted.filter(c => !c.parent_id || expandedIds.has(c.parent_id))

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
          <p className={s.pageSub}>{categories.length} catégorie{categories.length > 1 ? 's' : ''}</p>
        </div>
        <button className={s.btnPrimary} onClick={() => setModal('new')}>
          <Plus size={16} /> Nouvelle catégorie
        </button>
      </div>

      <div className={s.toolbar}>
        <div className={s.searchWrap}>
          <Search size={14} className={s.searchIcon} />
          <input
            type="search"
            className={s.searchInput}
            placeholder="Rechercher par nom ou slug…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <ErrorBanner onRetry={load} />}

      <div className={s.card}>
        <div className={s.tableHead}>
          <span>Catégorie</span>
          <span>Slug</span>
          <span>DE</span>
          <span>EN</span>
          <span>Produits</span>
          <span>Ordre</span>
          <span></span>
        </div>

        {loading ? (
          <div className={s.skeletonWrap}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={s.skeleton} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className={s.empty}>
            {search ? 'Aucune catégorie trouvée.' : 'Aucune catégorie enregistrée.'}
          </p>
        ) : (
          filtered.map(cat => {
            const depth     = depthOf(cat)
            const isChild   = depth > 0
            const nameFr    = cat.translations?.fr?.name ?? cat.slug
            const nameDe    = cat.translations?.de?.name
            const nameEn    = cat.translations?.en?.name
            const hasChildren = sorted.some(c => c.parent_id === cat.id)
            const isExpanded  = query ? true : expandedIds.has(cat.id)
            /* Le compte produits vient déjà agrégé sur toute la descendance depuis le backend */
            const productCount = Number(cat.product_count) || 0

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
                      disabled={!!query}
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
                </div>
                <span className={s.slug}>{cat.slug}</span>
                <span className={s.transCell}>{nameDe || <span className={s.missing}>—</span>}</span>
                <span className={s.transCell}>{nameEn || <span className={s.missing}>—</span>}</span>
                <span className={s.productCount} data-zero={productCount === 0 ? 'true' : 'false'}>
                  {productCount}
                </span>
                <span className={s.muted}>{cat.sort_order ?? 0}</span>
                <div className={s.actions}>
                  <button className={s.iconBtn} onClick={() => setModal(cat)} aria-label="Modifier">
                    <Edit2 size={13} />
                  </button>
                  <button className={s.iconBtnDanger} onClick={() => handleDelete(cat.id)} aria-label="Supprimer">
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

/* ── Page principale — onglets Catégories / Tags ── */
const TABS = [
  { id: 'categories', label: 'Catégories', icon: Tag },
  { id: 'tags',       label: 'Tags',       icon: TagsIcon },
]

export default function Categories() {
  const [activeTab, setActiveTab] = useState('categories')

  return (
    <div className={s.page}>
      <div className={s.tabs} role="tablist" aria-label="Catégories et tags">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${s.tab} ${activeTab === tab.id ? s.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={14} /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'categories' ? <CategoriesPanel /> : <TagsPanel />}
    </div>
  )
}
