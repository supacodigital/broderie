import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, SlidersHorizontal, ChevronDown } from 'lucide-react'
import s from './FilterPanel.module.css'

/* Construit l'arbre catégories → sous-catégories à partir d'une liste plate */
function buildTree(categories) {
  const parents  = categories.filter(c => !c.parent_id)
  const children = categories.filter(c =>  c.parent_id)
  return parents.map(p => ({
    ...p,
    children: children.filter(c => c.parent_id === p.id),
  }))
}

export default function FilterPanel({ filters, onChange, categories = [], onClose, mobileOpen }) {
  const { t } = useTranslation()

  /* Catégories parentes ouvertes par défaut si une sous-cat est active */
  const tree = useMemo(() => buildTree(categories), [categories])

  const activeSlug = filters.category ?? ''
  const activeParentId = useMemo(() => {
    const active = categories.find(c => c.slug === activeSlug)
    if (!active) return null
    if (!active.parent_id) return active.id
    return active.parent_id
  }, [categories, activeSlug])

  const [openParents, setOpenParents] = useState(() => {
    if (!activeParentId) return {}
    return { [activeParentId]: true }
  })

  function set(key, value) {
    onChange({ ...filters, [key]: value, page: 1 })
  }

  function clearAll() {
    onChange({ page: 1, limit: 20 })
  }

  function toggleParent(id) {
    setOpenParents(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const hasActive = filters.category || filters.min_price || filters.max_price || filters.in_stock

  return (
    <>
      {/* ── Overlay mobile ── */}
      {mobileOpen && <div className={s.overlay} onClick={onClose} aria-hidden="true" />}

      <aside
        className={`${s.panel} ${mobileOpen ? s.panelOpen : ''}`}
        aria-label="Filtres"
      >
        <div className={s.header}>
          <div className={s.headerLeft}>
            <SlidersHorizontal size={15} aria-hidden="true" />
            <span>{t('catalogue.filters')}</span>
          </div>
          <div className={s.headerRight}>
            {hasActive && (
              <button className={s.clearBtn} onClick={clearAll}>
                {t('catalogue.clearFilters')}
              </button>
            )}
            <button className={s.closeBtn} onClick={onClose} aria-label="Fermer les filtres">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Catégories ── */}
        <div className={s.group}>
          <p className={s.groupTitle}>{t('catalogue.category')}</p>
          <ul className={s.catList} role="list">

            {/* Tout afficher */}
            <li>
              <button
                className={`${s.catBtn} ${!activeSlug ? s.catBtnActive : ''}`}
                onClick={() => set('category', '')}
              >
                {t('catalogue.allCategories')}
              </button>
            </li>

            {tree.map(parent => {
              const isOpen       = !!openParents[parent.id]
              const parentActive = activeSlug === parent.slug
              const childActive  = parent.children.some(c => c.slug === activeSlug)

              return (
                <li key={parent.id} className={s.catGroup}>
                  {/* ── Ligne catégorie parente ── */}
                  <div className={`${s.parentRow} ${parentActive || childActive ? s.parentRowActive : ''}`}>
                    <button
                      className={`${s.catBtn} ${s.catBtnParent} ${parentActive ? s.catBtnActive : ''}`}
                      onClick={() => set('category', parent.slug)}
                    >
                      {parent.name}
                    </button>

                    {/* Flèche accordéon — seulement si la catégorie a des enfants */}
                    {parent.children.length > 0 && (
                      <button
                        className={`${s.arrowBtn} ${isOpen ? s.arrowOpen : ''}`}
                        onClick={() => toggleParent(parent.id)}
                        aria-label={isOpen ? 'Réduire' : 'Développer'}
                        aria-expanded={isOpen}
                      >
                        <ChevronDown size={14} />
                      </button>
                    )}
                  </div>

                  {/* ── Sous-catégories (accordéon) ── */}
                  {parent.children.length > 0 && (
                    <ul
                      className={`${s.subList} ${isOpen ? s.subListOpen : ''}`}
                      role="list"
                    >
                      {parent.children.map(child => (
                        <li key={child.id}>
                          <button
                            className={`${s.catBtn} ${s.subCatBtn} ${activeSlug === child.slug ? s.catBtnActive : ''}`}
                            onClick={() => set('category', child.slug)}
                          >
                            {child.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        {/* ── Prix ── */}
        <div className={s.group}>
          <p className={s.groupTitle}>{t('catalogue.price')}</p>
          <div className={s.priceRow}>
            <div className={s.priceField}>
              <label htmlFor="min-price" className={s.priceLabel}>Min CHF</label>
              <input
                id="min-price"
                type="number"
                className={s.priceInput}
                min={0}
                step={5}
                value={filters.min_price ?? ''}
                onChange={e => set('min_price', e.target.value || undefined)}
                placeholder="0"
              />
            </div>
            <span className={s.priceSep}>–</span>
            <div className={s.priceField}>
              <label htmlFor="max-price" className={s.priceLabel}>Max CHF</label>
              <input
                id="max-price"
                type="number"
                className={s.priceInput}
                min={0}
                step={5}
                value={filters.max_price ?? ''}
                onChange={e => set('max_price', e.target.value || undefined)}
                placeholder="500"
              />
            </div>
          </div>
        </div>

        {/* ── Disponibilité ── */}
        <div className={s.group}>
          <p className={s.groupTitle}>{t('catalogue.availability')}</p>
          <label className={s.checkRow}>
            <input
              type="checkbox"
              className={s.checkbox}
              checked={!!filters.in_stock}
              onChange={e => set('in_stock', e.target.checked ? true : undefined)}
            />
            <span>{t('catalogue.inStockOnly')}</span>
          </label>
        </div>
      </aside>
    </>
  )
}
