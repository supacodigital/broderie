import { createContext, useCallback, useContext, useEffect, useReducer, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { roundCHF } from '../utils/chf.js'
import { addCartItem, fetchCart, removeCartItem, updateCartItem } from '../services/cart.service.js'
import { useAuth } from './AuthContext.jsx'
import { useToastShortcuts } from '../hooks/useToastShortcuts.jsx'

/* ── État initial ── */
export const INITIAL = { items: [], loading: false, error: null }

/* ── Reducer ── */
export function cartReducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING': return { ...state, loading: action.payload }
    case 'SET_ERROR':   return { ...state, error: action.payload, loading: false }
    case 'SET_ITEMS':   return { ...state, items: action.payload, loading: false, error: null }
    case 'CLEAR':       return { ...INITIAL }
    default:            return state
  }
}

/* Normalise un item serveur vers le format interne du frontend */
function normalizeItem(item) {
  return {
    ...item,
    unit_price:    parseFloat(item.unit_price    ?? item.price_snapshot ?? 0),
    product_image: item.product_image ?? item.image_url ?? null,
  }
}

/* ── Context ── */
const CartContext = createContext(null)

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, INITIAL)
  const { loading: authLoading } = useAuth()
  const toast = useToastShortcuts()
  const { t }  = useTranslation()

  /* Référence stable vers l'état courant — évite les stale closures dans les rollbacks */
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  /* Charge le panier uniquement après la restauration de session auth */
  useEffect(() => {
    if (authLoading) return
    fetchCart()
      .then(res => dispatch({ type: 'SET_ITEMS', payload: (res.data?.items ?? []).map(normalizeItem) }))
      .catch(() => dispatch({ type: 'SET_ITEMS', payload: [] }))
  }, [authLoading])

  /* Ajouter un article — optimistic UI */
  const addItem = useCallback(async ({ product, variant = null, qty = 1 }) => {
    const snapshot = stateRef.current.items
    const optimisticItem = {
      _optimistic: true,
      id: `opt-${Date.now()}`,
      product_id: product.id,
      variant_id: variant?.id ?? null,
      quantity: qty,
      unit_price: roundCHF(product.price_chf + (variant?.price_modifier ?? 0)),
      product_name: product.name,
      product_image: product.images?.[0]?.url ?? null,
      product_icon: product.icon ?? null,
      product_bg: product.bg ?? null,
      variant_value: variant?.value ?? null,
    }

    /* Ajout optimiste immédiat */
    dispatch({ type: 'SET_ITEMS', payload: mergeOrAdd(snapshot, optimisticItem) })

    try {
      const res = await addCartItem(product.id, variant?.id ?? null, qty)
      const serverItems = res.data?.items ?? []
      if (serverItems.length) {
        dispatch({ type: 'SET_ITEMS', payload: serverItems.map(normalizeItem) })
      }
      /* Confirmation immédiate près du point de clic. Le bouton « Valider mon panier »
         (bas de l'écran) prend ensuite le relais : il reste visible tant que le panier
         n'est pas vide, sans que le client ait à remonter en haut de page. */
      toast.success(t('cart.itemAdded'), { to: '/panier', label: t('cart.viewCart') })
    } catch {
      /* Rollback vers l'état au moment de l'appel — pas une closure périmée */
      dispatch({ type: 'SET_ITEMS', payload: snapshot })
      /* Erreur réseau : on prévient l'utilisateur au lieu de le laisser sans feedback */
      toast.error(t('cart.addFailed'))
    }
  }, [toast, t])

  /* Modifier la quantité */
  const updateQty = useCallback(async (itemId, quantity) => {
    if (quantity < 1) return removeItem(itemId)

    const prev = stateRef.current.items
    dispatch({
      type: 'SET_ITEMS',
      payload: prev.map(i => i.id === itemId ? { ...i, quantity } : i),
    })

    try {
      const res = await updateCartItem(itemId, quantity)
      const serverItems = res.data?.items ?? []
      if (serverItems.length) dispatch({ type: 'SET_ITEMS', payload: serverItems.map(normalizeItem) })
    } catch {
      dispatch({ type: 'SET_ITEMS', payload: prev })
    }
  }, [])

  /* Supprimer un article */
  const removeItem = useCallback(async (itemId) => {
    const prev = stateRef.current.items
    dispatch({ type: 'SET_ITEMS', payload: prev.filter(i => i.id !== itemId) })

    try {
      await removeCartItem(itemId)
    } catch {
      dispatch({ type: 'SET_ITEMS', payload: prev })
    }
  }, [])

  /* Vider le panier */
  const clearCart = useCallback(() => dispatch({ type: 'CLEAR' }), [])

  /* Recharger le panier depuis le serveur — après l'annulation d'une commande
     impayée, dont les articles ont été remis dans le panier côté serveur */
  const reloadCart = useCallback(async () => {
    try {
      const res = await fetchCart()
      dispatch({ type: 'SET_ITEMS', payload: (res.data?.items ?? []).map(normalizeItem) })
    } catch {
      dispatch({ type: 'SET_ITEMS', payload: [] })
    }
  }, [])

  /* Valeurs calculées */
  /* Nombre d'articles affiché dans la barre et le panier.
     Un article vendu à la coupe compte pour 1, quelle que soit la longueur :
     sa `quantity` est un nombre de tronçons de 10 cm, et l'additionner donnait
     « 6 articles » pour une seule bande de 60 cm. */
  const itemCount     = state.items.reduce((sum, i) => sum + (i.sold_by_length ? 1 : i.quantity), 0)
  const subtotal      = roundCHF(state.items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0))
  /* Poids : `weight_kg` d'un article à la coupe est le poids AU MÈTRE, et
     `quantity` un nombre de tronçons — on ramène donc à la longueur réelle,
     sinon 60 cm pèserait 6 mètres et les frais de port seraient faux. */
  const totalWeightKg = state.items.reduce((sum, i) => {
    const w = parseFloat(i.weight_kg ?? 0)
    if (!i.sold_by_length) return sum + w * i.quantity
    return sum + w * (i.quantity * (Number(i.length_step_cm) || 10)) / 100
  }, 0)

  const value = {
    items: state.items,
    loading: state.loading,
    error: state.error,
    itemCount,
    subtotal,
    totalWeightKg,
    addItem,
    updateQty,
    removeItem,
    clearCart,
    reloadCart,
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart doit être utilisé dans <CartProvider>')
  return ctx
}

/* ── Utilitaire : fusionne ou ajoute un item dans la liste ── */
export function mergeOrAdd(items, newItem) {
  const existing = items.find(
    i => i.product_id === newItem.product_id && i.variant_id === newItem.variant_id,
  )
  if (existing) {
    return items.map(i =>
      i.product_id === newItem.product_id && i.variant_id === newItem.variant_id
        ? { ...i, quantity: i.quantity + newItem.quantity }
        : i,
    )
  }
  return [...items, newItem]
}
