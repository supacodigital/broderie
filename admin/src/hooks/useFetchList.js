import { useState, useEffect, useCallback } from 'react'

/**
 * Encapsule le pattern fetch paginé : loading / error / annulation / reload.
 *
 * @param {Function} fetchFn  - Fonction de service qui retourne { data, pagination }
 * @param {Object}   params   - Paramètres passés à fetchFn (doivent être stables entre renders)
 * @param {Array}    deps     - Dépendances qui déclenchent un nouveau fetch
 * @returns {{ data, total, loading, error, reload }}
 */
export function useFetchList(fetchFn, params, deps) {
  const [data,        setData]        = useState([])
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  const reload = useCallback(() => setRefreshTick(t => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setError(false)
    setLoading(true)

    fetchFn(params)
      .then(res => {
        if (cancelled) return
        setData(res.data ?? [])
        setTotal(res.pagination?.total ?? 0)
      })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refreshTick])

  return { data, total, loading, error, reload }
}
