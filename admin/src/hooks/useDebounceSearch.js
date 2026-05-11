import { useState, useRef } from 'react'

/**
 * Gère un champ de recherche avec debounce et reset de page.
 *
 * @param {number}   delay     - Délai en ms (défaut 300)
 * @param {Function} onSearch  - Callback appelé avec la valeur debounced (ex: setPage(1))
 * @returns {{ search, debouncedSearch, handleSearch }}
 */
export function useDebounceSearch(delay = 300, onSearch) {
  const [search,         setSearch]         = useState('')
  const [debouncedSearch,setDebouncedSearch] = useState('')
  const timerRef = useRef(null)

  const handleSearch = (val) => {
    setSearch(val)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setDebouncedSearch(val)
      onSearch?.()
    }, delay)
  }

  return { search, debouncedSearch, handleSearch }
}
