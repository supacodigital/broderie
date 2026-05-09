import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, LayoutGrid, List, ArrowUp } from 'lucide-react'
import { getProducts, getCategories } from '../../services/products.service.js'
import { normalizeLocale } from '../../utils/locale.js'
import { useWishlist } from '../../contexts/WishlistContext.jsx'
import ProductCard            from '../../components/ui/ProductCard/ProductCard.jsx'
import { ProductCardSkeleton } from '../../components/ui/Skeleton/Skeleton.jsx'
import Pagination             from '../../components/ui/Pagination/Pagination.jsx'
import EmptyState             from '../../components/ui/EmptyState/EmptyState.jsx'
import FilterPanel            from './FilterPanel.jsx'
import SearchBar              from './SearchBar.jsx'
import s from './Catalogue.module.css'

/* ── Chips filtres actifs ── */
function ActiveFilters({ filters, categories, onChange }) {
  const chips = []

  if (filters.category) {
    const cat = categories.find(c => c.slug === filters.category)
    chips.push({
      key:   'category',
      label: cat?.name ?? filters.category,
      clear: () => onChange({ ...filters, category: '', page: 1 }),
    })
  }
  if (filters.q) {
    chips.push({
      key:   'q',
      label: `"${filters.q}"`,
      clear: () => onChange({ ...filters, q: undefined, page: 1 }),
    })
  }
  if (filters.min_price) {
    chips.push({
      key:   'min_price',
      label: `Min CHF ${filters.min_price}`,
      clear: () => onChange({ ...filters, min_price: undefined, page: 1 }),
    })
  }
  if (filters.max_price) {
    chips.push({
      key:   'max_price',
      label: `Max CHF ${filters.max_price}`,
      clear: () => onChange({ ...filters, max_price: undefined, page: 1 }),
    })
  }
  if (filters.in_stock) {
    chips.push({
      key:   'in_stock',
      label: 'En stock',
      clear: () => onChange({ ...filters, in_stock: undefined, page: 1 }),
    })
  }
  if (filters.badge) {
    const BADGE_LABELS = { nouveaute: 'Nouveauté', promo: 'Promotion', coup_de_coeur: 'Coup de cœur', exclusif: 'Exclusif' }
    chips.push({
      key:   'badge',
      label: BADGE_LABELS[filters.badge] ?? filters.badge,
      clear: () => onChange({ ...filters, badge: undefined, page: 1 }),
    })
  }
  if (filters.min_rating) {
    chips.push({
      key:   'min_rating',
      label: `★ ${filters.min_rating}+`,
      clear: () => onChange({ ...filters, min_rating: undefined, page: 1 }),
    })
  }

  if (chips.length === 0) return null

  return (
    <div className={s.activeFilters}>
      {chips.map(chip => (
        <button key={chip.key} className={s.chip} onClick={chip.clear}>
          {chip.label}
          <span className={s.chipX} aria-hidden="true">×</span>
        </button>
      ))}
      {chips.length > 1 && (
        <button
          className={s.chipClearAll}
          onClick={() => onChange({ page: 1, limit: filters.limit ?? 20 })}
        >
          Tout effacer
        </button>
      )}
    </div>
  )
}

/* ── Bouton retour en haut ── */
function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function onScroll() { setVisible(window.scrollY > 400) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      className={s.backToTop}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Retour en haut"
    >
      <ArrowUp size={18} />
    </button>
  )
}

export default function Catalogue() {
  const { categorySlug }       = useParams()
  const [searchParams]         = useSearchParams()
  const { t, i18n }            = useTranslation()

  const [products,    setProducts]    = useState([])
  const [categories,  setCategories]  = useState([])
  const [pagination,  setPagination]  = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(false)
  const { ids: wishlist, toggle: toggleWishlist } = useWishlist()
  const [filtersOpen, setFiltersOpen] = useState(false)

  /* Vue grille / liste — persistée en localStorage */
  const [viewMode, setViewMode] = useState(() =>
    localStorage.getItem('catalogue_view') ?? 'grid'
  )

  function toggleView(mode) {
    setViewMode(mode)
    localStorage.setItem('catalogue_view', mode)
  }

  /* Filtres synchronisés dans l'URL */
  const [filters, setFilters] = useState({
    page:     1,
    limit:    20,
    category: categorySlug ?? searchParams.get('category') ?? '',
    q:        searchParams.get('q')         ?? undefined,
    min_price:searchParams.get('min_price') ?? undefined,
    max_price:searchParams.get('max_price') ?? undefined,
    in_stock: searchParams.get('in_stock') === 'true' ? true : undefined,
    sort:       searchParams.get('sort')      ?? 'created_at',
    order:      searchParams.get('order')     ?? 'desc',
    featured:   searchParams.get('featured') === 'true' ? true : undefined,
    badge:      searchParams.get('badge')     ?? undefined,
    min_rating: searchParams.get('min_rating') ? parseInt(searchParams.get('min_rating')) : undefined,
  })

  useEffect(() => {
    setFilters(f => ({ ...f, category: categorySlug ?? '', page: 1 }))
  }, [categorySlug])

  /* Synchronise les filtres quand les searchParams changent depuis l'extérieur (ex: liens navbar) */
  useEffect(() => {
    setFilters(f => ({
      ...f,
      page:       1,
      q:          searchParams.get('q')          ?? undefined,
      min_price:  searchParams.get('min_price')  ?? undefined,
      max_price:  searchParams.get('max_price')  ?? undefined,
      in_stock:   searchParams.get('in_stock') === 'true' ? true : undefined,
      sort:       searchParams.get('sort')        ?? 'created_at',
      order:      searchParams.get('order')       ?? 'desc',
      featured:   searchParams.get('featured') === 'true' ? true : undefined,
      badge:      searchParams.get('badge')       ?? undefined,
      min_rating: searchParams.get('min_rating')  ? parseInt(searchParams.get('min_rating')) : undefined,
    }))
  }, [searchParams])

  useEffect(() => {
    getCategories(normalizeLocale(i18n.language))
      .then(d => setCategories(d.data ?? []))
      .catch(() => {})
  }, [i18n.language])

  const abortRef = useRef(null)

  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    setError(false)

    const params = Object.fromEntries(
      Object.entries({ ...filters, locale: normalizeLocale(i18n.language) })
        .filter(([, v]) => v !== undefined && v !== '' && v !== false)
    )

    getProducts(params)
      .then(d => {
        setProducts(d.data ?? [])
        setPagination(d.pagination ?? { page: 1, totalPages: 1, total: d.data?.length ?? 0 })
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [filters, i18n.language])

  const handleFiltersChange = useCallback((next) => setFilters(next), [])
  const handlePageChange    = useCallback((p)    => setFilters(f => ({ ...f, page: p })), [])
  const handleWishlist      = useCallback((id)   => toggleWishlist(id), [toggleWishlist])

  /* Breadcrumb : catégorie active + son parent éventuel */
  const activeCategory  = categories.find(c => c.slug === filters.category)
  const parentCategory  = activeCategory?.parent_id
    ? categories.find(c => c.id === activeCategory.parent_id)
    : null

  const pageTitle = activeCategory?.name ?? t('catalogue.allProducts')

  const skeletonHeights = [1, 0.75, 0.9, 1, 0.8, 0.95, 0.7, 1]

  return (
    <div className={s.page}>
      {/* ── En-tête ── */}
      <div className={s.hero}>
        {/* Breadcrumb */}
        {activeCategory && (
          <nav className={s.breadcrumb} aria-label="Fil d'Ariane">
            <Link to="/catalogue">{t('catalogue.allProducts')}</Link>
            {parentCategory && (
              <>
                <ChevronRight size={12} aria-hidden="true" />
                <button
                  className={s.breadcrumbBtn}
                  onClick={() => handleFiltersChange({ ...filters, category: parentCategory.slug, page: 1 })}
                >
                  {parentCategory.name}
                </button>
              </>
            )}
            <ChevronRight size={12} aria-hidden="true" />
            <span aria-current="page">{activeCategory.name}</span>
          </nav>
        )}

        <p className={s.heroEyebrow}>{t('catalogue.eyebrow')}</p>
        <h1 className={s.heroTitle}>{pageTitle}</h1>
        {pagination.total > 0 && (
          <p className={s.heroCount}>
            {t('catalogue.resultCount', { count: pagination.total })}
          </p>
        )}
      </div>

      <div className={s.layout}>
        <FilterPanel
          filters={filters}
          onChange={handleFiltersChange}
          categories={categories}
          mobileOpen={filtersOpen}
          onClose={() => setFiltersOpen(false)}
        />

        <div className={s.main}>
          {/* SearchBar avec tri */}
          <SearchBar
            filters={filters}
            onChange={handleFiltersChange}
            total={pagination.total}
            onToggleFilters={() => setFiltersOpen(o => !o)}
            viewMode={viewMode}
            onViewChange={toggleView}
          />

          {/* Chips filtres actifs */}
          <ActiveFilters
            filters={filters}
            categories={categories}
            onChange={handleFiltersChange}
          />

          {error && (
            <EmptyState
              icon="⚠️"
              title={t('errors.network')}
              ctaLabel={t('errors.retry')}
              onRetry={() => setFilters(f => ({ ...f }))}
            />
          )}

          {loading ? (
            <div className={viewMode === 'list' ? s.listView : s.grid}>
              {Array.from({ length: filters.limit }).map((_, i) => (
                <ProductCardSkeleton
                  key={i}
                  mode={viewMode}
                  heightRatio={skeletonHeights[i % skeletonHeights.length]}
                />
              ))}
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              icon="🔍"
              title={t('empty.products')}
              desc={filters.q ? `Aucun résultat pour "${filters.q}"` : 'Essayez de modifier vos filtres.'}
              ctaLabel={t('catalogue.clearFilters')}
              onRetry={() => handleFiltersChange({ page: 1, limit: 20 })}
            />
          ) : (
            <div className={viewMode === 'list' ? s.listView : s.grid}>
              {products.map((p, i) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  index={i}
                  wishlisted={wishlist.has(p.id)}
                  onWishlist={handleWishlist}
                  mode={viewMode}
                />
              ))}
            </div>
          )}

          {!loading && products.length > 0 && (
            <Pagination
              page={pagination.page ?? filters.page}
              totalPages={pagination.totalPages}
              onChange={handlePageChange}
            />
          )}
        </div>
      </div>

      <BackToTop />
    </div>
  )
}
