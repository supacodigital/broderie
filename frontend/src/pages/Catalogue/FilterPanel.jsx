import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X, SlidersHorizontal, ChevronDown, Star } from 'lucide-react'
import s from './FilterPanel.module.css'

/* Construit l'arbre catégories → sous-catégories → petites-sous-catégories (3 niveaux max)
   à partir d'une liste plate — chaque nœud reçoit un tableau `children` récursif */
function buildTree(categories, parentId = null) {
  return categories
    .filter(c => (c.parent_id ?? null) === parentId)
    .map(c => ({
      ...c,
      children: buildTree(categories, c.id),
    }))
}

/* Remonte la chaîne d'ancêtres d'une catégorie active, du plus proche parent à la racine */
function ancestorIds(categories, activeId) {
  const ids = []
  let current = categories.find(c => c.id === activeId)
  while (current?.parent_id) {
    ids.push(current.parent_id)
    current = categories.find(c => c.id === current.parent_id)
  }
  return ids
}

const BADGES = [
  { value: 'nouveaute',    label: 'Nouveauté',      color: '#2e7d32' },
  { value: 'promo',        label: 'Promotion',       color: '#c62828' },
  { value: 'coup_de_coeur',label: 'Coup de cœur',   color: '#ad1457' },
  { value: 'exclusif',     label: 'Exclusif',        color: '#6a1b9a' },
]

const MIN_RATINGS = [4, 3, 2]

/* Un nœud de l'arbre catégories, rendu récursivement pour supporter les 3 niveaux
   (parent → enfant → petit-enfant) avec un accordéon à chaque niveau qui en a besoin.
   `depth` pilote uniquement l'indentation visuelle du bouton. */
function CategoryNode({ node, depth, activeSlug, openParents, onToggle, onSelect }) {
  const isOpen        = !!openParents[node.id]
  const isActive      = activeSlug === node.slug
  const hasDescendantActive = (n) =>
    n.children.some(c => c.slug === activeSlug || hasDescendantActive(c))
  const descendantActive = hasDescendantActive(node)
  const hasChildren   = node.children.length > 0

  return (
    <li className={depth === 0 ? s.catGroup : undefined}>
      <div className={`${s.parentRow} ${isActive || descendantActive ? s.parentRowActive : ''}`}>
        <button
          className={`${s.catBtn} ${depth === 0 ? s.catBtnParent : s.subCatBtn} ${isActive ? s.catBtnActive : ''}`}
          style={depth > 1 ? { paddingLeft: 22 + (depth - 1) * 14 } : undefined}
          onClick={() => onSelect(node.slug)}
        >
          {node.name}
        </button>
        {hasChildren && (
          <button
            className={`${s.arrowBtn} ${isOpen ? s.arrowOpen : ''}`}
            onClick={() => onToggle(node.id)}
            aria-label={isOpen ? 'Réduire' : 'Développer'}
            aria-expanded={isOpen}
          >
            <ChevronDown size={14} />
          </button>
        )}
      </div>

      {hasChildren && (
        <ul className={`${s.subList} ${isOpen ? s.subListOpen : ''}`} role="list">
          {node.children.map(child => (
            <CategoryNode
              key={child.id}
              node={child}
              depth={depth + 1}
              activeSlug={activeSlug}
              openParents={openParents}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function FilterPanel({ filters, onChange, categories = [], tags = [], onClose, mobileOpen }) {
  const { t } = useTranslation()

  const tree = useMemo(() => buildTree(categories), [categories])

  const activeSlug = filters.category ?? ''
  /* Tous les ancêtres (parent, grand-parent…) de la catégorie active, peu importe sa
     profondeur — sert à déplier automatiquement toute la branche jusqu'à la racine */
  const activeAncestorIds = useMemo(() => {
    const active = categories.find(c => c.slug === activeSlug)
    if (!active) return []
    return ancestorIds(categories, active.id)
  }, [categories, activeSlug])

  const [openParents, setOpenParents] = useState(() => {
    if (activeAncestorIds.length === 0) return {}
    return Object.fromEntries(activeAncestorIds.map(id => [id, true]))
  })

  /* Si la catégorie active change (ex: navigation depuis la navbar), on déplie toute sa
     branche sans jamais replier une section déjà ouverte par l'utilisateur */
  useEffect(() => {
    if (activeAncestorIds.length === 0) return
    setOpenParents(prev => {
      const next = { ...prev }
      let changed = false
      for (const id of activeAncestorIds) {
        if (!next[id]) { next[id] = true; changed = true }
      }
      return changed ? next : prev
    })
  }, [activeAncestorIds])

  function set(key, value) {
    onChange({ ...filters, [key]: value, page: 1 })
  }

  function clearAll() {
    onChange({ page: 1, limit: filters.limit ?? 20 })
  }

  function toggleParent(id) {
    setOpenParents(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleBadge(value) {
    set('badge', filters.badge === value ? undefined : value)
  }

  function setMinRating(value) {
    set('min_rating', filters.min_rating === value ? undefined : value)
  }

  const hasActive = filters.category || filters.tag || filters.min_price || filters.max_price
    || filters.in_stock || filters.made_to_order || filters.badge || filters.min_rating

  return (
    <>
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
            <li>
              <button
                className={`${s.catBtn} ${!activeSlug ? s.catBtnActive : ''}`}
                onClick={() => set('category', '')}
              >
                {t('catalogue.allCategories')}
              </button>
            </li>

            {tree.map(parent => (
              <CategoryNode
                key={parent.id}
                node={parent}
                depth={0}
                activeSlug={activeSlug}
                openParents={openParents}
                onToggle={toggleParent}
                onSelect={slug => set('category', slug)}
              />
            ))}
          </ul>
        </div>

        {/* ── Tags / thèmes — sélection unique, alignée sur le filtre ?tag=slug de l'API ── */}
        {tags.length > 0 && (
          <div className={s.group}>
            <p className={s.groupTitle}>Thème</p>
            <div className={s.tagCheckList}>
              {tags.map(tag => (
                <label key={tag.id} className={s.checkRow}>
                  <input
                    type="checkbox"
                    className={s.checkbox}
                    checked={filters.tag === tag.slug}
                    onChange={() => set('tag', filters.tag === tag.slug ? undefined : tag.slug)}
                  />
                  <span>{tag.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ── Badges ── */}
        <div className={s.group}>
          <p className={s.groupTitle}>Sélection</p>
          <div className={s.badgeList}>
            {BADGES.map(b => (
              <button
                key={b.value}
                className={`${s.badgeChip} ${filters.badge === b.value ? s.badgeChipActive : ''}`}
                style={{ '--badge-color': b.color }}
                onClick={() => toggleBadge(b.value)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Note minimale ── */}
        <div className={s.group}>
          <p className={s.groupTitle}>Note minimale</p>
          <div className={s.ratingList}>
            {MIN_RATINGS.map(n => (
              <button
                key={n}
                className={`${s.ratingBtn} ${filters.min_rating === n ? s.ratingBtnActive : ''}`}
                onClick={() => setMinRating(n)}
              >
                <span className={s.stars}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={13}
                      className={i < n ? s.starFilled : s.starEmpty}
                    />
                  ))}
                </span>
                <span className={s.ratingLabel}>& plus</span>
              </button>
            ))}
          </div>
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
          <label className={s.checkRow}>
            <input
              type="checkbox"
              className={s.checkbox}
              checked={!!filters.made_to_order}
              onChange={e => set('made_to_order', e.target.checked ? true : undefined)}
            />
            <span>{t('catalogue.madeToOrderOnly')}</span>
          </label>
        </div>
      </aside>
    </>
  )
}
