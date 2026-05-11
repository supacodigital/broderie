import { useState, useRef, useCallback } from 'react'
import { searchProducts } from '../services/products.service.js'
import { normalizeLocale } from '../utils/locale.js'

/**
 * Centralise la logique de recherche de produits avec suggestions autocomplete.
 *
 * @param {string} language  - Valeur de i18n.language
 * @param {number} debounceMs - Délai debounce en ms (défaut 200)
 * @param {number} limit      - Nombre max de suggestions (défaut 6)
 * @returns {{ value, setValue, suggestions, activeIndex, loading, fetchSuggestions, handleKeyDown, clearSearch }}
 */
export function useProductSearch(language, debounceMs = 200, limit = 6) {
  const [value,       setValue]       = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [loading,     setLoading]     = useState(false)
  const debounceRef = useRef(null)

  const fetchSuggestions = useCallback((val) => {
    clearTimeout(debounceRef.current)
    if (val.trim().length < 2) {
      setSuggestions([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchProducts(val.trim(), { locale: normalizeLocale(language), limit })
        setSuggestions(res.data ?? [])
        setActiveIndex(-1)
      } catch {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, debounceMs)
  }, [language, debounceMs, limit])

  const handleKeyDown = useCallback((e, onSelect) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0) onSelect(suggestions[activeIndex])
    } else if (e.key === 'Escape') {
      setSuggestions([])
    }
  }, [suggestions, activeIndex])

  const clearSearch = useCallback(() => {
    clearTimeout(debounceRef.current)
    setValue('')
    setSuggestions([])
    setActiveIndex(-1)
    setLoading(false)
  }, [])

  return { value, setValue, suggestions, setSuggestions, activeIndex, setActiveIndex, loading, fetchSuggestions, handleKeyDown, clearSearch }
}
