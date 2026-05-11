import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X, SlidersHorizontal, LayoutGrid, List } from 'lucide-react'
import { useProductSearch } from '../../hooks/useProductSearch.js'
import { roundCHF } from '../../utils/chf.js'
import s from './SearchBar.module.css'

const SORT_OPTIONS = [
  { value: 'created_at:desc', labelKey: 'catalogue.sortNewest'      },
  { value: 'badge:nouveaute', labelKey: 'catalogue.sortNewBadge'    },
  { value: 'price_chf:asc',   labelKey: 'catalogue.sortPriceAsc'   },
  { value: 'price_chf:desc',  labelKey: 'catalogue.sortPriceDesc'  },
  { value: 'avg_rating:desc', labelKey: 'catalogue.sortRating'     },
  { value: 'name:asc',        labelKey: 'catalogue.sortNameAsc'    },
]

export default function SearchBar({ filters, onChange, total, onToggleFilters, viewMode, onViewChange }) {
  const { t, i18n } = useTranslation()

  const {
    value: inputValue,
    setValue: setInputValue,
    suggestions,
    setSuggestions,
    activeIndex,
    setActiveIndex,
    fetchSuggestions,
    handleKeyDown: handleSearchKeyDown,
    clearSearch: clearSearchHook,
  } = useProductSearch(i18n.language, 200, 6)

  const [showDropdown, setShowDropdown] = useState(false)
  const gridDebounce = useRef(null)
  const wrapRef      = useRef(null)

  useEffect(() => {
    setShowDropdown(suggestions.length > 0)
  }, [suggestions])

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function handleInput(e) {
    const val = e.target.value
    setInputValue(val)
    fetchSuggestions(val)
    clearTimeout(gridDebounce.current)
    gridDebounce.current = setTimeout(() => {
      onChange({ ...filters, q: val || undefined, page: 1 })
    }, 300)
  }

  function selectSuggestion(product) {
    setInputValue(product.name)
    setSuggestions([])
    setShowDropdown(false)
    clearTimeout(gridDebounce.current)
    onChange({ ...filters, q: product.name, page: 1 })
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { setShowDropdown(false); return }
    handleSearchKeyDown(e, selectSuggestion)
  }

  function clearSearch() {
    clearSearchHook()
    setShowDropdown(false)
    clearTimeout(gridDebounce.current)
    onChange({ ...filters, q: undefined, page: 1 })
  }

  function handleSort(e) {
    const val = e.target.value
    if (val.startsWith('badge:')) {
      const badge = val.split(':')[1]
      onChange({ ...filters, badge, sort: 'created_at', order: 'desc', page: 1 })
    } else {
      const [sort, order] = val.split(':')
      onChange({ ...filters, badge: undefined, sort, order, page: 1 })
    }
  }

  const currentSort = filters.badge === 'nouveaute'
    ? 'badge:nouveaute'
    : `${filters.sort ?? 'created_at'}:${filters.order ?? 'desc'}`

  return (
    <div className={s.bar}>
      {/* ── Ligne 1 : recherche + filtres mobile ── */}
      <div className={s.row}>
        <button className={s.filterToggle} onClick={onToggleFilters} aria-label="Ouvrir les filtres">
          <SlidersHorizontal size={15} />
          <span>{t('catalogue.filters')}</span>
        </button>

        <div className={s.searchWrap} ref={wrapRef}>
          <Search size={15} className={s.searchIcon} aria-hidden="true" />
          <input
            type="text"
            className={s.searchInput}
            placeholder={t('catalogue.searchPlaceholder')}
            value={inputValue}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (suggestions.length > 0) setShowDropdown(true) }}
            aria-label={t('catalogue.searchPlaceholder')}
            aria-autocomplete="list"
            aria-expanded={showDropdown}
            autoComplete="off"
          />
          {inputValue && (
            <button className={s.clearSearch} onClick={clearSearch} aria-label="Effacer la recherche">
              <X size={14} />
            </button>
          )}

          {showDropdown && suggestions.length > 0 && (
            <ul className={s.dropdown} role="listbox">
              {suggestions.map((p, i) => (
                <li
                  key={p.id}
                  className={`${s.suggestion} ${activeIndex === i ? s.suggestionActive : ''}`}
                  role="option"
                  aria-selected={activeIndex === i}
                  onMouseDown={() => selectSuggestion(p)}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className={s.suggestionImg} width="36" height="36" />
                  ) : (
                    <div className={s.suggestionImgFallback} aria-hidden="true">🧵</div>
                  )}
                  <div className={s.suggestionText}>
                    <span className={s.suggestionName}>{p.name}</span>
                    <span className={s.suggestionPrice}>CHF {roundCHF(p.price_chf).toFixed(2)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Ligne 2 : compteur + tri + vue ── */}
      <div className={s.toolbar}>
        {total !== undefined && (
          <p className={s.count}>{t('catalogue.resultCount', { count: total })}</p>
        )}

        <div className={s.toolbarRight}>
          {/* Tri */}
          <div className={s.sortWrap}>
            <label htmlFor="sort-select" className={s.sortLabel}>{t('catalogue.sortBy')}</label>
            <select id="sort-select" className={s.sortSelect} value={currentSort} onChange={handleSort}>
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
              ))}
            </select>
          </div>

          {/* Toggle vue */}
          <div className={s.viewToggle} role="group" aria-label="Mode d'affichage">
            <button
              className={`${s.viewBtn} ${viewMode === 'grid' ? s.viewBtnActive : ''}`}
              onClick={() => onViewChange('grid')}
              aria-label="Vue grille"
              aria-pressed={viewMode === 'grid'}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              className={`${s.viewBtn} ${viewMode === 'list' ? s.viewBtnActive : ''}`}
              onClick={() => onViewChange('list')}
              aria-label="Vue liste"
              aria-pressed={viewMode === 'list'}
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
