import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Search, X, ArrowRight } from 'lucide-react'
import { useProductSearch } from '../../../hooks/useProductSearch.js'
import SearchSuggestion from '../../ui/SearchSuggestion/SearchSuggestion.jsx'
import s from './NavSearch.module.css'

/* Recherche de la barre de navigation.

   Desktop : le champ se déploie à gauche de la loupe, dans la barre elle-même.
   La page reste visible et cliquable, et le panneau de suggestions s'ancre sous
   le champ. La fenêtre modale précédente confisquait tout l'écran pour une
   action légère et fréquente.

   Mobile : le tiroir est conservé. À 375 px, un champ en ligne n'aurait pas la
   place de cohabiter avec les icônes sans les masquer. */
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

  const inputRef = useRef(null)
  const wrapRef  = useRef(null)

  /* Focus à l'ouverture + reset.
     Le délai laisse le champ atteindre sa largeur avant d'y poser le curseur :
     focaliser un champ de 0 px pousse certains navigateurs à faire défiler la
     page pour le ramener dans le viewport. */
  useEffect(() => {
    if (!open) return
    clearSearch()
    const id = setTimeout(() => inputRef.current?.focus(), 80)
    return () => clearTimeout(id)
  }, [open, clearSearch])

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
    setValue(val)
    fetchSuggestions(val)
  }

  function go(q) {
    onClose()
    navigate(`/catalogue?q=${encodeURIComponent(q.trim())}`)
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
  const showEmpty  = !loading && value.trim().length >= 2 && !hasResults

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
            onClick={() => { clearSearch(); inputRef.current?.focus() }}
            aria-label="Effacer"
          >
            <X size={14} />
          </button>
        )}

        {/* Panneau de suggestions — ancré sous le champ */}
        {open && (hasResults || showEmpty) && (
          <div className={s.panel}>
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

          <div className={s.drawer} role="search" aria-label="Recherche produits">
            <div className={s.drawerHandle} />

            <div className={s.drawerInputRow}>
              <Search size={18} className={s.searchIcon} aria-hidden="true" />
              <input
                type="text"
                className={s.input}
                placeholder={t('catalogue.searchPlaceholder')}
                value={value}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                autoComplete="off"
              />
              {value
                ? <button className={s.clearBtn} onClick={clearSearch} aria-label="Effacer"><X size={16} /></button>
                : <button className={s.closeBtn} onClick={onClose} aria-label="Fermer"><X size={20} /></button>
              }
            </div>

            {hasResults && (
              <ul className={s.drawerResults} role="listbox">
                {suggestions.map((p, i) => (
                  <li
                    key={p.id}
                    className={`${s.drawerResult} ${activeIndex === i ? s.resultActive : ''}`}
                    role="option"
                    aria-selected={activeIndex === i}
                    onMouseDown={() => go(p.name)}
                  >
                    <SearchSuggestion product={p} query={value} />
                    <ArrowRight size={14} className={s.resultArrow} aria-hidden="true" />
                  </li>
                ))}
              </ul>
            )}

            {hasResults && (
              <button className={s.seeAll} type="button" onMouseDown={() => go(value)}>
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
