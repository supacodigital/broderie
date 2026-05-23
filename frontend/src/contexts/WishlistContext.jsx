import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getWishlist, addToWishlist, removeFromWishlist } from '../services/wishlist.service.js'
import { useAuth } from './AuthContext.jsx'
import { useToast } from './ToastContext.jsx'

const WishlistContext = createContext(null)

export function WishlistProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const { showToast } = useToast()
  const { t } = useTranslation()
  const [ids, setIds] = useState(new Set())

  /* Charge les ids wishlist au login */
  useEffect(() => {
    if (!isAuthenticated) { setIds(new Set()); return }
    getWishlist()
      .then(res => {
        const items = res.data ?? []
        setIds(new Set(items.map(i => i.product_id)))
      })
      .catch(() => setIds(new Set()))
  }, [isAuthenticated])

  const toggle = useCallback(async (productId) => {
    /* Non connecté : on invite l'utilisateur à se connecter via un toast */
    if (!isAuthenticated) {
      showToast({
        icon: <Heart size={14} fill="currentColor" />,
        message: t('wishlist.loginRequired'),
        action: { to: '/connexion', label: t('wishlist.loginCta') },
      })
      return
    }

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
        await removeFromWishlist(productId)
      } else {
        await addToWishlist(productId)
      }
    } catch {
      /* Rollback */
      setIds(prev => {
        const next = new Set(prev)
        wasIn ? next.add(productId) : next.delete(productId)
        return next
      })
    }
  }, [isAuthenticated, showToast, t])

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
