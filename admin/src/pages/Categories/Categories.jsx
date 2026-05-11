import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Edit2, Trash2, Tag, AlertTriangle, Check, X, ChevronRight, Search } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getCategories, createCategory, updateCategory, deleteCategory } from '../../services/categories.service.js'
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

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm({
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
      setApiError(err.response?.data?.message ?? 'Une erreur est survenue.')
    }
  }

  const parents = categories.filter(c => !c.parent_id && c.id !== category?.id)

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

          <p className={s.sectionLabel}>Traductions</p>
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
            <div className={s.field}>
              <label className={s.label}>Description FR</label>
              <input className={s.input} {...register('descFr')} />
            </div>
            <div className={s.field}>
              <label className={s.label}>Description DE</label>
              <input className={s.input} {...register('descDe')} />
            </div>
            <div className={s.field}>
              <label className={s.label}>Description EN</label>
              <input className={s.input} {...register('descEn')} />
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
              <select className={s.input} {...register('parentId')}>
                <option value="">— Racine —</option>
                {parents.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.translations?.fr?.name ?? p.slug}
                  </option>
                ))}
              </select>
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

/* ── Page principale ── */
export default function Categories() {
  const toast = useToast()
  const [categories, setCategories] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(false)
  const [modal,      setModal]      = useState(null)
  const [confirm,    setConfirm]    = useState(null)
  const [search,     setSearch]     = useState('')
  const debounceRef = useRef(null)

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

  /* Tri : parents d'abord, enfants juste après leur parent */
  const sorted = (() => {
    const parents  = categories.filter(c => !c.parent_id)
    const children = categories.filter(c =>  c.parent_id)
    const result   = []
    for (const p of parents) {
      result.push(p)
      result.push(...children.filter(c => c.parent_id === p.id))
    }
    const inResult = new Set(result.map(c => c.id))
    result.push(...children.filter(c => !inResult.has(c.id)))
    return result
  })()

  /* Filtre local par recherche */
  const filtered = search.trim()
    ? sorted.filter(c => {
        const q = search.toLowerCase()
        return (
          c.slug?.toLowerCase().includes(q) ||
          c.translations?.fr?.name?.toLowerCase().includes(q) ||
          c.translations?.de?.name?.toLowerCase().includes(q) ||
          c.translations?.en?.name?.toLowerCase().includes(q)
        )
      })
    : sorted

  return (
    <div className={s.page}>
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
            const isChild = !!cat.parent_id
            const nameFr  = cat.translations?.fr?.name ?? cat.slug
            const nameDe  = cat.translations?.de?.name
            const nameEn  = cat.translations?.en?.name

            return (
              <div key={cat.id} className={`${s.tableRow} ${isChild ? s.tableRowChild : ''}`}>
                <div className={s.catCell}>
                  {isChild
                    ? <ChevronRight size={14} className={s.childArrow} />
                    : <div className={s.catIcon}><Tag size={13} /></div>
                  }
                  <span className={s.catName}>{nameFr}</span>
                  {isChild && <span className={s.subBadge}>sous-cat.</span>}
                </div>
                <span className={s.slug}>{cat.slug}</span>
                <span className={s.transCell}>{nameDe || <span className={s.missing}>—</span>}</span>
                <span className={s.transCell}>{nameEn || <span className={s.missing}>—</span>}</span>
                <span className={s.productCount} data-zero={cat.product_count === 0 || cat.product_count === '0' ? 'true' : 'false'}>
                  {cat.product_count ?? 0}
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
    </div>
  )
}
