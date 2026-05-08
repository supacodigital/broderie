import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X, SlidersHorizontal, LayoutGrid, List } from 'lucide-react'
import { normalizeLocale } from '../../utils/locale.js'
import api from '../../services/api.js'
import s from './SearchBar.module.css'

const SORT_OPTIONS = [
  { value: 'created_at:desc', labelKey: 'catalogue.sortNewest'    },
  { value: 'created_at:asc',  labelKey: 'catalogue.sortOldest'    },
  { value: 'price_chf:asc',   labelKey: 'catalogue.sortPriceAsc'  },
  { value: 'price_chf:desc',  labelKey: 'catalogue.sortPriceDesc' },
  { value: 'avg_rating:desc', labelKey: 'catalogue.sortRating'    },
]

export default function SearchBar({ filters, onChange, total, onToggleFilters, viewMode, onViewChange }) {
  const { t, i18n } = useTranslation()

  const [inputValue,   setInputValue]   = useState(filters.q ?? '')
  const [suggestions,  setSuggestions]  = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [activeIndex,  setActiveIndex]  = useState(-1)

  const gridDebounce    = useRef(null)
  const suggestDebounce = useRef(null)
  const wrapRef         = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const fetchSuggestions = useCallback((val) => {
    clearTimeout(suggestDebounce.current)
    if (val.trim().length < 2) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }
    suggestDebounce.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/products', {
          params: { q: val.trim(), locale: normalizeLocale(i18n.language), limit: 6 },
        })
        setSuggestions(data.data ?? [])
        setShowDropdown((data.data ?? []).length > 0)
        setActiveIndex(-1)
      } catch {
        setSuggestions([])
        setShowDropdown(false)
      }
    }, 200)
  }, [i18n.language])

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
    if (!showDropdown || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      selectSuggestion(suggestions[activeIndex])
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  function clearSearch() {
    setInputValue('')
    setSuggestions([])
    setShowDropdown(false)
    clearTimeout(gridDebounce.current)
    clearTimeout(suggestDebounce.current)
    onChange({ ...filters, q: undefined, page: 1 })
  }

  function handleSort(e) {
    const [sort, order] = e.target.value.split(':')
    onChange({ ...filters, sort, order, page: 1 })
  }

  const currentSort = `${filters.sort ?? 'created_at'}:${filters.order ?? 'desc'}`

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
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
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
                    <span className={s.suggestionPrice}>CHF {parseFloat(p.price_chf).toFixed(2)}</span>
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
