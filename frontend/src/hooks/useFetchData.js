import { useState, useEffect, useCallback } from 'react'

/**
 * Encapsule le pattern fetch simple : loading / data / error / reload.
 * Pour les listes paginées côté admin, voir useFetchList.
 *
 * @param {Function} fetchFn - Fonction async qui retourne les données
 * @param {Array}    deps    - Dépendances qui déclenchent un nouveau fetch
 * @returns {{ data, loading, error, reload }}
 */
export function useFetchData(fetchFn, deps = []) {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  const reload = useCallback(() => setRefreshTick(t => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setError(false)
    setLoading(true)

    fetchFn()
      .then(res => { if (!cancelled) setData(res) })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refreshTick])

  return { data, loading, error, reload }
}
