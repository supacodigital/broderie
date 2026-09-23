import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X, SlidersHorizontal, LayoutGrid, List } from 'lucide-react'
import { useProductSearch } from '../../hooks/useProductSearch.js'
import { addToSearchHistory } from '../../utils/searchHistory.js'
import SearchSuggestion from '../../components/ui/SearchSuggestion/SearchSuggestion.jsx'
import s from './SearchBar.module.css'

/* L'option « Nouveautés » filtrait sur le badge `nouveaute`, qu'aucun produit
   ne porte (0 sur 15 496) : elle vidait la page. Elle faisait de toute façon
   doublon avec « Les plus récents », qui trie sur la date d'ajout. */
const SORT_OPTIONS = [
  { value: 'created_at:desc', labelKey: 'catalogue.sortNewest'      },
  { value: 'price_chf:asc',   labelKey: 'catalogue.sortPriceAsc'   },
  { value: 'price_chf:desc',  labelKey: 'catalogue.sortPriceDesc'  },
  { value: 'avg_rating:desc', labelKey: 'catalogue.sortRating'     },
  { value: 'name:asc',        labelKey: 'catalogue.sortNameAsc'    },
]

export default function SearchBar({ filters, onChange, onToggleFilters, viewMode, onViewChange }) {
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

  /* Réaffiche le terme recherché dans le champ quand il vient de l'extérieur : arrivée
     depuis la barre de la navbar, lien partagé, rafraîchissement, ou retour depuis une
     fiche produit. Sans cela les résultats étaient bien filtrés mais le champ restait
     vide, ce qui donnait l'impression que la recherche avait été oubliée.
     La synchronisation ne s'applique qu'au montage et aux changements venus de l'URL —
     `inputValue` est volontairement hors dépendances pour ne pas écraser la frappe
     en cours pendant le debounce de 300 ms. */
  const externalQuery = filters.q ?? ''
  useEffect(() => {
    setInputValue(prev => (prev === externalQuery ? prev : externalQuery))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalQuery])

  useEffect(() => {
    setShowDropdown(suggestions.length > 0)
  }, [suggestions])

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    /* `touchstart` en plus de `mousedown` : sur un téléphone, toucher hors du
       panneau n'émet pas `mousedown` et les suggestions restaient ouvertes
       par-dessus les résultats. */
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('touchstart', onClickOutside)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('touchstart', onClickOutside)
    }
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

  // Recherche choisie : elle rejoint les recherches récentes de la loupe
  function selectSuggestion(product) {
    addToSearchHistory(product.name)
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

  /* Touche « Rechercher » du clavier tactile : elle soumet le formulaire sans
     émettre d'événement clavier exploitable. On applique le terme immédiatement,
     sans attendre le debounce de 300 ms, et on referme le clavier pour laisser
     voir les résultats. */
  function handleSubmit(e) {
    e.preventDefault()
    setShowDropdown(false)
    clearTimeout(gridDebounce.current)
    // Recherche validée (et non frappe en cours) : elle rejoint les recherches récentes
    addToSearchHistory(inputValue)
    onChange({ ...filters, q: inputValue.trim() || undefined, page: 1 })
    e.target.querySelector('input')?.blur()
  }

  function clearSearch() {
    clearSearchHook()
    setShowDropdown(false)
    clearTimeout(gridDebounce.current)
    onChange({ ...filters, q: undefined, page: 1 })
  }

  /* Le badge n'est plus piloté depuis le tri — il reste filtrable par les puces
     « Sélection » du panneau de filtres, qui ne l'écrasent pas ici. */
  function handleSort(e) {
    const [sort, order] = e.target.value.split(':')
    onChange({ ...filters, sort, order, page: 1 })
  }

  const currentSort = `${filters.sort ?? 'created_at'}:${filters.order ?? 'desc'}`

  return (
    <div className={s.bar}>
      {/* ── Accès aux filtres — mobile uniquement (masqué en CSS sur desktop) ── */}
      <div className={s.row}>
        <button className={s.filterToggle} onClick={onToggleFilters} aria-label="Ouvrir les filtres">
          <SlidersHorizontal size={15} />
          <span>{t('catalogue.filters')}</span>
        </button>
      </div>

      {/* ── Barre d'outils : recherche + tri + vue ──
          La recherche a remplacé le compteur de résultats : « 15 497 produits »
          occupait la place la plus visible de la page sans aider à choisir. */}
      <div className={s.toolbar}>
        <form className={s.searchWrap} ref={wrapRef} onSubmit={handleSubmit} role="search">
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
            /* Clavier tactile : touche « Rechercher », et pas de correction
               automatique — « moulinés » corrigé en « moulines » ne ramène rien. */
            enterKeyHint="search"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
          {inputValue && (
            <button type="button" className={s.clearSearch} onClick={clearSearch} aria-label="Effacer la recherche">
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
                  /* onClick et non onMouseDown : au tactile, `mousedown` n'est
                     pas émis de façon fiable — un appui sur une suggestion
                     restait sans effet depuis un téléphone (CLI-01). */
                  onClick={() => selectSuggestion(p)}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <SearchSuggestion product={p} query={inputValue} showCategory />
                </li>
              ))}
            </ul>
          )}
        </form>

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
