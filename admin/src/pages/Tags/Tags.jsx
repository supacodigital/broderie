import { useEffect, useState, useCallback } from 'react'
import { Plus, Edit2, Trash2, Tag as TagIcon, AlertTriangle, Check, X, Search } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getTags, createTag, updateTag, deleteTag } from '../../services/tags.service.js'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog/ConfirmDialog.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import s from './Tags.module.css'

const schema = z.object({
  slug:      z.string().min(1, 'Slug requis').regex(/^[a-z0-9-]+$/, 'Minuscules, chiffres et tirets uniquement'),
  sortOrder: z.coerce.number().int().min(0).optional(),
  nameFr:    z.string().min(1, 'Nom FR requis'),
  nameDe:    z.string().optional(),
  nameEn:    z.string().optional(),
})

function toSlug(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/* ── Modale création / édition ── */
function TagModal({ tag, onClose, onSaved }) {
  const isEdit = !!tag
  const [apiError, setApiError] = useState('')
  const [saved,    setSaved]    = useState(false)

  const { register, handleSubmit, setValue, watch, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: isEdit ? {
      slug:      tag.slug             ?? '',
      sortOrder: tag.sort_order       ?? 0,
      nameFr:    tag.translations?.fr?.name ?? '',
      nameDe:    tag.translations?.de?.name ?? '',
      nameEn:    tag.translations?.en?.name ?? '',
    } : { sortOrder: 0 },
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
      sortOrder: data.sortOrder ?? 0,
      translations: {
        fr: { name: data.nameFr },
        ...(data.nameDe ? { de: { name: data.nameDe } } : {}),
        ...(data.nameEn ? { en: { name: data.nameEn } } : {}),
      },
    }
    try {
      if (isEdit) {
        await updateTag(tag.id, payload)
      } else {
        await createTag(payload)
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
            {isEdit ? `Modifier — ${tag.translations?.fr?.name ?? tag.slug}` : 'Nouveau tag'}
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

          <p className={s.sectionLabel}>Paramètres</p>
          <div className={s.formGrid2}>
            <div className={s.field}>
              <label className={s.label}>Slug URL *</label>
              <input
                className={`${s.input} ${errors.slug ? s.inputError : ''}`}
                {...register('slug')}
                onInput={() => setSlugTouched(true)}
                placeholder="ex: noel"
              />
              {errors.slug && <span className={s.err}>{errors.slug.message}</span>}
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

/* ── Panneau tags — utilisé comme onglet dans la page Catégories ── */
export function TagsPanel() {
  const toast = useToast()
  const [tags,    setTags]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [modal,   setModal]   = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [search,  setSearch]  = useState('')

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await getTags()
      setTags(res ?? [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = (id) => {
    setConfirm({
      message: 'Supprimer ce tag ? Les produits liés perdront simplement ce thème.',
      onConfirm: async () => {
        try {
          await deleteTag(id)
          setTags(prev => prev.filter(t => t.id !== id))
          toast.success('Tag supprimé.')
        } catch (err) {
          toast.error(err.response?.data?.message ?? 'Erreur lors de la suppression.')
        }
      },
    })
  }

  const matchesQuery = (t, q) => (
    t.slug?.toLowerCase().includes(q) ||
    t.translations?.fr?.name?.toLowerCase().includes(q) ||
    t.translations?.de?.name?.toLowerCase().includes(q) ||
    t.translations?.en?.name?.toLowerCase().includes(q)
  )

  const query = search.trim().toLowerCase()
  const sorted = [...tags].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const filtered = query ? sorted.filter(t => matchesQuery(t, query)) : sorted

  return (
    <>
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
      {modal && (
        <TagModal
          tag={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}

      <div className={s.pageHead}>
        <div>
          <h1 className={s.pageTitle}>Tags</h1>
          <p className={s.pageSub}>{tags.length} tag{tags.length > 1 ? 's' : ''}</p>
        </div>
        <button className={s.btnPrimary} onClick={() => setModal('new')}>
          <Plus size={16} /> Nouveau tag
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
          <span>Tag</span>
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
            {search ? 'Aucun tag trouvé.' : 'Aucun tag enregistré.'}
          </p>
        ) : (
          filtered.map(tag => {
            const nameFr = tag.translations?.fr?.name ?? tag.slug
            const nameDe = tag.translations?.de?.name
            const nameEn = tag.translations?.en?.name
            const productCount = Number(tag.product_count) || 0

            return (
              <div key={tag.id} className={s.tableRow}>
                <div className={s.catCell}>
                  <div className={s.catIcon}><TagIcon size={13} /></div>
                  <span className={s.catName}>{nameFr}</span>
                </div>
                <span className={s.slug}>{tag.slug}</span>
                <span className={s.transCell}>{nameDe || <span className={s.missing}>—</span>}</span>
                <span className={s.transCell}>{nameEn || <span className={s.missing}>—</span>}</span>
                <span className={s.productCount} data-zero={productCount === 0 ? 'true' : 'false'}>
                  {productCount}
                </span>
                <span className={s.muted}>{tag.sort_order ?? 0}</span>
                <div className={s.actions}>
                  <button className={s.iconBtn} onClick={() => setModal(tag)} aria-label="Modifier">
                    <Edit2 size={13} />
                  </button>
                  <button className={s.iconBtnDanger} onClick={() => handleDelete(tag.id)} aria-label="Supprimer">
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
