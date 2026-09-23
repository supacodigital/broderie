import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search, X, ArrowRight, Clock } from 'lucide-react'
import { useProductSearch } from '../../../hooks/useProductSearch.js'
import {
  readSearchHistory, addToSearchHistory, removeFromSearchHistory, clearSearchHistory,
} from '../../../utils/searchHistory.js'
import SearchSuggestion from '../../ui/SearchSuggestion/SearchSuggestion.jsx'
import s from './NavSearch.module.css'

/* Recherche de la barre de navigation.

   Desktop : le champ se déploie à gauche de la loupe, dans la barre elle-même.
   La page reste visible et cliquable, et le panneau de suggestions s'ancre sous
   le champ. La fenêtre modale précédente confisquait tout l'écran pour une
   action légère et fréquente.

   Mobile : le tiroir est conservé. À 375 px, un champ en ligne n'aurait pas la
   place de cohabiter avec les icônes sans les masquer. */
/* Mémoire du dernier terme recherché, le temps de la visite (CLI-01 — « mémoriser
   le terme saisi dans l'input »). Stockage facultatif : navigation privée ou
   stockage bloqué, la loupe s'ouvre simplement vide. */
const LAST_SEARCH_KEY = 'nav_last_search'
const readLastSearch = () => {
  try { return sessionStorage.getItem(LAST_SEARCH_KEY) ?? '' } catch { return '' }
}
const writeLastSearch = (term) => {
  try {
    if (term) sessionStorage.setItem(LAST_SEARCH_KEY, term)
    else sessionStorage.removeItem(LAST_SEARCH_KEY)
  } catch { /* stockage indisponible : rien à mémoriser */ }
}

/* Terme à remettre dans la loupe à l'ouverture : sur le catalogue, la recherche
   affichée (celle de l'adresse — vide si la cliente l'a retirée) ; ailleurs, par
   exemple sur une fiche ouverte depuis les résultats, la dernière recherche. */
const initialSearchTerm = (location) => (
  location.pathname.startsWith('/catalogue')
    ? new URLSearchParams(location.search).get('q') ?? ''
    : readLastSearch()
)

export default function NavSearch({ open, onClose }) {
  const { t, i18n } = useTranslation()
  const navigate     = useNavigate()

  const {
    value,
    setValue,
    suggestions,
    activeIndex,
    setActiveIndex,
    loading,
    fetchSuggestions,
    handleKeyDown: handleSearchKeyDown,
    clearSearch,
  } = useProductSearch(i18n.language, 200, 5)

  const location       = useLocation()
  // Lu à l'ouverture seulement : un changement de page ne doit pas relancer l'effet
  const locationRef    = useRef(location)
  const inputRef       = useRef(null)  // champ desktop, dans la barre
  const drawerInputRef = useRef(null)  // champ mobile, dans le tiroir
  const wrapRef        = useRef(null)

  /* Historique des recherches et « la cliente a-t-elle tapé depuis l'ouverture ».
     Réinitialisés à chaque ouverture, pendant le rendu (et non dans un effet) :
     c'est le schéma React pour recaler un état sur une prop, sans rendu
     intermédiaire où l'ancien historique s'afficherait. */
  const [history,     setHistory]     = useState(() => (open ? readSearchHistory() : []))
  const [hasTyped,    setHasTyped]    = useState(false)
  const [lastOpen,    setLastOpen]    = useState(open)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setHistory(readSearchHistory())
      setHasTyped(false)
    }
  }

  /* Focus à l'ouverture + reset (CLI-01).
     Le délai laisse le champ atteindre sa largeur avant d'y poser le curseur :
     focaliser un champ de 0 px pousse certains navigateurs à faire défiler la
     page pour le ramener dans le viewport.

     Les deux champs coexistent dans le DOM et c'est le CSS qui masque l'un ou
     l'autre selon la largeur. On focalise donc celui qui est réellement affiché :
     viser le champ desktop depuis un téléphone posait le curseur dans un élément
     en `display: none`, le clavier ne s'ouvrait pas et la frappe n'arrivait nulle
     part — le champ paraissait inopérant. */
  // Déclaré avant l'effet d'ouverture : les effets s'exécutent dans cet ordre
  useEffect(() => { locationRef.current = location }, [location])

  /* Reprise de la recherche en cours (CLI-01) : la loupe se vidait à chaque
     ouverture — préciser « coton mouliné » en « coton mouliné 310 » obligeait à
     tout retaper, sur un clavier de téléphone. Le curseur est placé en fin de
     texte, prêt à compléter. */
  useEffect(() => {
    if (!open) return
    clearSearch()
    const initial = initialSearchTerm(locationRef.current)
    if (initial) setValue(initial)
    const id = setTimeout(() => {
      const target = drawerInputRef.current?.offsetParent !== null
        ? drawerInputRef.current
        : inputRef.current
      target?.focus()
      const end = target?.value?.length ?? 0
      target?.setSelectionRange?.(end, end)
    }, 80)
    return () => clearTimeout(id)
  }, [open, clearSearch, setValue])

  /* Escape ferme */
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  /* Clic en dehors : ferme le champ. Remplace le voile de la fenêtre modale —
     la page reste utilisable et un clic ailleurs reprend simplement le fil. */
  useEffect(() => {
    if (!open) return
    function onPointerDown(e) {
      // Le bouton loupe gère lui-même la bascule : l'ignorer ici évite un
      // « ferme puis rouvre » qui empêcherait la fermeture.
      if (e.target.closest('[data-nav-search-toggle]')) return
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open, onClose])

  function handleInput(e) {
    const val = e.target.value
    setHasTyped(true)
    setValue(val)
    fetchSuggestions(val)
  }

  function go(q) {
    onClose()
    writeLastSearch(q.trim())
    addToSearchHistory(q)
    navigate(`/catalogue?q=${encodeURIComponent(q.trim())}`)
  }

  function removeHistoryItem(term) {
    removeFromSearchHistory(term)
    setHistory(readSearchHistory())
  }

  function clearHistory() {
    clearSearchHistory()
    setHistory([])
  }

  // Effacer à la croix : le terme est aussi oublié, il ne reviendra pas à la prochaine ouverture
  function handleClear() {
    clearSearch()
    writeLastSearch('')
  }

  /* Soumission du formulaire mobile (touche « Rechercher » du clavier tactile).
     Le champ perd le focus d'abord : sans cela le clavier reste ouvert par-dessus
     la page de résultats qui vient de s'afficher. */
  function handleSubmit(e) {
    e.preventDefault()
    if (value.trim().length < 2) return
    drawerInputRef.current?.blur()
    go(value)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && activeIndex < 0 && value.trim().length >= 2) {
      e.preventDefault()
      go(value)
      return
    }
    handleSearchKeyDown(e, (product) => go(product.name))
  }

  const hasResults = suggestions.length > 0
  /* « Aucun produit » seulement si la cliente a tapé : à l'ouverture, la loupe
     reprend la recherche en cours sans charger de suggestions, et ce message
     s'affichait à tort sous « coton mouliné ». */
  const showEmpty  = hasTyped && !loading && value.trim().length >= 2 && !hasResults
  /* Recherches récentes : champ vide, ou recherche en cours reprise telle quelle —
     dès que la cliente tape, les suggestions produits prennent le relais. */
  // Le terme déjà dans le champ n'est pas répété en tête de liste
  const currentTerm    = value.trim().toLocaleLowerCase('fr')
  const visibleHistory = history.filter((t) => t.trim().toLocaleLowerCase('fr') !== currentTerm)
  const showHistory    = visibleHistory.length > 0 && (!hasTyped || !value.trim())

  /* Liste des recherches récentes, commune aux deux écrans. Un tap relance la
     recherche ; la croix la retire de l'historique. onClick et non onMouseDown :
     au tactile, `mousedown` n'est pas émis de façon fiable. */
  const historyBlock = showHistory && (
    <div className={s.history}>
      <div className={s.historyHead}>
        <span className={s.historyTitle} id="nav-search-history-title">Recherches récentes</span>
        <button type="button" className={s.historyClearAll} onClick={clearHistory}>
          Tout effacer
        </button>
      </div>
      <ul className={s.historyList} aria-labelledby="nav-search-history-title">
        {visibleHistory.map((term) => (
          <li key={term} className={s.historyItem}>
            <button type="button" className={s.historyTerm} onClick={() => go(term)}>
              <Clock size={14} className={s.historyIcon} aria-hidden="true" />
              <span className={s.historyText}>{term}</span>
            </button>
            <button
              type="button"
              className={s.historyRemove}
              onClick={() => removeHistoryItem(term)}
              aria-label={`Retirer « ${term} » des recherches récentes`}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <>
      {/* ── DESKTOP : champ en ligne dans la barre ──
          Toujours monté : la largeur étant animée, l'élément doit exister avant
          l'ouverture pour que la transition ait un point de départ. */}
      <div
        ref={wrapRef}
        className={`${s.inline} ${open ? s.inlineOpen : ''}`}
        role="search"
        aria-label="Recherche produits"
      >
        <input
          ref={inputRef}
          type="text"
          className={s.inlineInput}
          placeholder={t('catalogue.searchPlaceholder')}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={hasResults}
          /* Champ replié : hors du parcours clavier et des lecteurs d'écran,
             sinon la tabulation s'arrête sur un élément invisible. */
          tabIndex={open ? 0 : -1}
          aria-hidden={!open}
        />

        {open && value && (
          <button
            className={s.inlineClear}
            onClick={() => { handleClear(); inputRef.current?.focus() }}
            aria-label="Effacer"
          >
            <X size={14} />
          </button>
        )}

        {/* Panneau de suggestions — ancré sous le champ */}
        {open && (hasResults || showEmpty || showHistory) && (
          <div className={s.panel}>
            {historyBlock}

            {hasResults && (
              <ul className={s.results} role="listbox">
                {suggestions.map((p, i) => (
                  <li
                    key={p.id}
                    className={`${s.result} ${activeIndex === i ? s.resultActive : ''}`}
                    role="option"
                    aria-selected={activeIndex === i}
                    onMouseDown={() => go(p.name)}
                    onMouseEnter={() => setActiveIndex(i)}
                  >
                    <SearchSuggestion product={p} query={value} showCategory />
                    <ArrowRight size={14} className={s.resultArrow} aria-hidden="true" />
                  </li>
                ))}
              </ul>
            )}

            {/* Hors de la liste défilante : à l'intérieur, le lien passait sous
                la limite de défilement et se retrouvait tronqué hors du panneau. */}
            {hasResults && (
              <button className={s.seeAll} type="button" onMouseDown={() => go(value)}>
                <Search size={13} aria-hidden="true" />
                Voir tous les résultats pour <strong>«&nbsp;{value}&nbsp;»</strong>
              </button>
            )}

            {showEmpty && (
              <p className={s.empty}>Aucun produit trouvé pour «&nbsp;{value}&nbsp;»</p>
            )}
          </div>
        )}
      </div>

      {/* ── MOBILE : tiroir depuis le haut ── */}
      {open && (
        <>
          <div className={s.backdrop} onClick={onClose} aria-hidden="true" />

          <div className={s.drawer}>
            <div className={s.drawerHandle} />

            {/* Un vrai <form> : sur un clavier tactile, la touche « Rechercher »
                soumet le formulaire et n'émet pas toujours d'événement clavier
                exploitable. Sans formulaire, appuyer dessus ne faisait rien et la
                saisie semblait perdue. */}
            <form className={s.drawerInputRow} onSubmit={handleSubmit} role="search">
              <Search size={18} className={s.searchIcon} aria-hidden="true" />
              <input
                ref={drawerInputRef}
                type="text"
                className={s.input}
                placeholder={t('catalogue.searchPlaceholder')}
                value={value}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                /* Le clavier tactile propose « Rechercher » plutôt que « Entrée »,
                   et le champ reste hors des corrections automatiques : « moulinés »
                   corrigé en « moulines » ne ramènerait aucun résultat. */
                enterKeyHint="search"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
              />
              {value
                ? <button type="button" className={s.clearBtn} onClick={handleClear} aria-label="Effacer"><X size={16} /></button>
                : <button type="button" className={s.closeBtn} onClick={onClose} aria-label="Fermer"><X size={20} /></button>
              }
            </form>

            {historyBlock}

            {hasResults && (
              <ul className={s.drawerResults} role="listbox">
                {suggestions.map((p, i) => (
                  <li
                    key={p.id}
                    className={`${s.drawerResult} ${activeIndex === i ? s.resultActive : ''}`}
                    role="option"
                    aria-selected={activeIndex === i}
                    /* onClick et non onMouseDown : au tactile, `mousedown` n'est
                       émis qu'en fin de séquence et seulement si le navigateur
                       décide de simuler la souris — un appui sur une suggestion
                       restait donc sans effet sur un téléphone. */
                    onClick={() => go(p.name)}
                  >
                    <SearchSuggestion product={p} query={value} />
                    <ArrowRight size={14} className={s.resultArrow} aria-hidden="true" />
                  </li>
                ))}
              </ul>
            )}

            {hasResults && (
              <button className={s.seeAll} type="button" onClick={() => go(value)}>
                <Search size={13} aria-hidden="true" />
                Voir tous les résultats pour <strong>«&nbsp;{value}&nbsp;»</strong>
              </button>
            )}

            {showEmpty && <p className={s.empty}>Aucun produit trouvé</p>}
          </div>
        </>
      )}
    </>
  )
}
