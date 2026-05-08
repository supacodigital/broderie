import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import api from '../services/api.js'
import { useAuth } from './AuthContext.jsx'

const WishlistContext = createContext(null)

export function WishlistProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const [ids, setIds] = useState(new Set())

  /* Charge les ids wishlist au login */
  useEffect(() => {
    if (!isAuthenticated) { setIds(new Set()); return }
    api.get('/users/me/wishlist')
      .then(res => {
        const items = res.data?.data ?? []
        setIds(new Set(items.map(i => i.product_id)))
      })
      .catch(() => setIds(new Set()))
  }, [isAuthenticated])

  const toggle = useCallback(async (productId) => {
    if (!isAuthenticated) return

    let wasIn = false
    /* Optimistic — lit l'état courant dans le setter pour éviter le stale closure */
    setIds(prev => {
      wasIn = prev.has(productId)
      const next = new Set(prev)
      wasIn ? next.delete(productId) : next.add(productId)
      return next
    })

    try {
      if (wasIn) {
        await api.delete(`/users/me/wishlist/${productId}`)
      } else {
        await api.post(`/users/me/wishlist/${productId}`)
      }
    } catch {
      /* Rollback */
      setIds(prev => {
        const next = new Set(prev)
        wasIn ? next.add(productId) : next.delete(productId)
        return next
      })
    }
  }, [isAuthenticated])

  return (
    <WishlistContext.Provider value={{ ids, toggle }}>
      {children}
    </WishlistContext.Provider>
  )
}

export function useWishlist() {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error('useWishlist doit être utilisé dans <WishlistProvider>')
  return ctx
}
