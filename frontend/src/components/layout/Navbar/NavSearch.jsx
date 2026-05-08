import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Search, X, ArrowRight } from 'lucide-react'
import { normalizeLocale } from '../../../utils/locale.js'
import api from '../../../services/api.js'
import s from './NavSearch.module.css'

export default function NavSearch({ open, onClose }) {
  const { t, i18n } = useTranslation()
  const navigate    = useNavigate()

  const [value,       setValue]       = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [loading,     setLoading]     = useState(false)

  const inputRef    = useRef(null)
  const debounceRef = useRef(null)

  /* Focus à l'ouverture + reset */
  useEffect(() => {
    if (open) {
      setValue('')
      setSuggestions([])
      setActiveIndex(-1)
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [open])

  /* Escape ferme */
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const fetchSuggestions = useCallback((val) => {
    clearTimeout(debounceRef.current)
    if (val.trim().length < 2) { setSuggestions([]); setLoading(false); return }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/products', {
          params: { q: val.trim(), locale: normalizeLocale(i18n.language), limit: 5 },
        })
        setSuggestions(data.data ?? [])
        setActiveIndex(-1)
      } catch {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 200)
  }, [i18n.language])

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
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0) go(suggestions[activeIndex].name)
      else if (value.trim().length >= 2) go(value)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Fond flouté — clic ferme */}
      <div className={s.backdrop} onClick={onClose} aria-hidden="true" />

      {/* ── DESKTOP : Spotlight centré ── */}
      <div className={s.spotlight} role="search" aria-label="Recherche produits">
        <div className={s.spotlightInner}>

          {/* Champ */}
          <div className={s.inputRow}>
            <Search size={20} className={s.searchIcon} aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              className={s.input}
              placeholder={t('catalogue.searchPlaceholder')}
              value={value}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={suggestions.length > 0}
            />
            {value && (
              <button
                className={s.clearBtn}
                onClick={() => { setValue(''); setSuggestions([]); inputRef.current?.focus() }}
                aria-label="Effacer"
              >
                <X size={16} />
              </button>
            )}
            <button className={s.closeBtn} onClick={onClose} aria-label="Fermer">
              <X size={18} />
              <span className={s.closeBtnLabel}>Esc</span>
            </button>
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
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
                  <div className={s.resultImg}>
                    {p.image_url
                      ? <img src={p.image_url} alt="" width="44" height="44" />
                      : <span aria-hidden="true">🧵</span>
                    }
                  </div>
                  <div className={s.resultInfo}>
                    <span className={s.resultName}>{p.name}</span>
                    {p.category_name && <span className={s.resultCat}>{p.category_name}</span>}
                  </div>
                  <span className={s.resultPrice}>CHF {parseFloat(p.price_chf).toFixed(2)}</span>
                  <ArrowRight size={14} className={s.resultArrow} aria-hidden="true" />
                </li>
              ))}

              {/* Lien "voir tous les résultats" */}
              <li className={s.seeAll} onMouseDown={() => go(value)}>
                <Search size={13} aria-hidden="true" />
                Voir tous les résultats pour <strong>«&nbsp;{value}&nbsp;»</strong>
              </li>
            </ul>
          )}

          {/* État vide après frappe */}
          {!loading && value.trim().length >= 2 && suggestions.length === 0 && (
            <p className={s.empty}>Aucun produit trouvé pour «&nbsp;{value}&nbsp;»</p>
          )}
        </div>
      </div>

      {/* ── MOBILE : Drawer depuis le haut ── */}
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
            ? <button className={s.clearBtn} onClick={() => { setValue(''); setSuggestions([]) }} aria-label="Effacer"><X size={16} /></button>
            : <button className={s.closeBtn} onClick={onClose} aria-label="Fermer"><X size={20} /></button>
          }
        </div>

        {suggestions.length > 0 && (
          <ul className={s.drawerResults} role="listbox">
            {suggestions.map((p, i) => (
              <li
                key={p.id}
                className={`${s.drawerResult} ${activeIndex === i ? s.resultActive : ''}`}
                role="option"
                onMouseDown={() => go(p.name)}
              >
                <div className={s.resultImg}>
                  {p.image_url
                    ? <img src={p.image_url} alt="" width="44" height="44" />
                    : <span aria-hidden="true">🧵</span>
                  }
                </div>
                <div className={s.resultInfo}>
                  <span className={s.resultName}>{p.name}</span>
                  <span className={s.resultPrice}>CHF {parseFloat(p.price_chf).toFixed(2)}</span>
                </div>
                <ArrowRight size={14} className={s.resultArrow} aria-hidden="true" />
              </li>
            ))}
            <li className={s.seeAll} onMouseDown={() => go(value)}>
              <Search size={13} aria-hidden="true" />
              Voir tous les résultats pour <strong>«&nbsp;{value}&nbsp;»</strong>
            </li>
          </ul>
        )}

        {!loading && value.trim().length >= 2 && suggestions.length === 0 && (
          <p className={s.empty}>Aucun produit trouvé</p>
        )}
      </div>
    </>
  )
}
