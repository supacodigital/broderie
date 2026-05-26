import { createContext, useCallback, useContext, useState } from 'react'

/* ── Contexte d'ouverture du drawer panier ── */
const CartDrawerContext = createContext(null)

export function CartDrawerProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)

  const openCartDrawer = useCallback(() => setIsOpen(true), [])
  const closeCartDrawer = useCallback(() => setIsOpen(false), [])
  const toggleCartDrawer = useCallback(() => setIsOpen(o => !o), [])

  return (
    <CartDrawerContext.Provider value={{ isOpen, openCartDrawer, closeCartDrawer, toggleCartDrawer }}>
      {children}
    </CartDrawerContext.Provider>
  )
}

export function useCartDrawer() {
  const ctx = useContext(CartDrawerContext)
  if (!ctx) throw new Error('useCartDrawer doit être utilisé dans <CartDrawerProvider>')
  return ctx
}
