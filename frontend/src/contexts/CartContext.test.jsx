import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { CartProvider, useCart } from './CartContext.jsx'

/* CLI-13 — « le panier affiche le nombre d'unités et non le nombre de
   positions », et le panier doit suivre la connexion de la cliente. */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: 'fr' } }),
}))
vi.mock('../hooks/useToastShortcuts.jsx', () => ({
  useToastShortcuts: () => ({ success: vi.fn(), error: vi.fn() }),
}))

let authValue
vi.mock('./AuthContext.jsx', () => ({
  useAuth: () => authValue,
}))

const fetchCartMock = vi.fn()
vi.mock('../services/cart.service.js', () => ({
  fetchCart: (...args) => fetchCartMock(...args),
  addCartItem: vi.fn(),
  removeCartItem: vi.fn(),
  updateCartItem: vi.fn(),
}))

function Counter() {
  const { itemCount, items } = useCart()
  return <p>{itemCount} positions / {items.length} lignes</p>
}

const cart = (items) => ({ data: { items } })

beforeEach(() => {
  authValue = { loading: false, user: null }
  fetchCartMock.mockReset()
})

describe('CartContext', () => {
  test('compte les positions, pas le cumul des unités', async () => {
    fetchCartMock.mockResolvedValue(cart([
      { id: 1, product_id: 10, quantity: 3, unit_price: 3.9 },  // 3 écheveaux du même coton
      { id: 2, product_id: 11, quantity: 1, unit_price: 12 },
      { id: 3, product_id: 12, quantity: 6, unit_price: 1.65, sold_by_length: 1 }, // 60 cm
    ]))

    render(<CartProvider><Counter /></CartProvider>)

    expect(await screen.findByText('3 positions / 3 lignes')).toBeInTheDocument()
  })

  /* À la connexion, le serveur fusionne le panier d'invitée avec celui du
     compte : l'affichage doit le recharger, sinon les articles du compte
     restent invisibles jusqu'au prochain rechargement de page. */
  test('recharge le panier à la connexion et à la déconnexion', async () => {
    fetchCartMock.mockResolvedValueOnce(cart([{ id: 1, product_id: 10, quantity: 1, unit_price: 5 }]))
    const { rerender } = render(<CartProvider><Counter /></CartProvider>)
    expect(await screen.findByText('1 positions / 1 lignes')).toBeInTheDocument()

    fetchCartMock.mockResolvedValueOnce(cart([
      { id: 1, product_id: 10, quantity: 1, unit_price: 5 },
      { id: 4, product_id: 20, quantity: 2, unit_price: 8 },
    ]))
    authValue = { loading: false, user: { id: 42 } }
    rerender(<CartProvider><Counter /></CartProvider>)
    expect(await screen.findByText('2 positions / 2 lignes')).toBeInTheDocument()

    fetchCartMock.mockResolvedValueOnce(cart([]))
    authValue = { loading: false, user: null }
    rerender(<CartProvider><Counter /></CartProvider>)
    expect(await screen.findByText('0 positions / 0 lignes')).toBeInTheDocument()
    expect(fetchCartMock).toHaveBeenCalledTimes(3)
  })

  test('attend la restauration de la session avant de charger le panier', async () => {
    authValue = { loading: true, user: null }
    fetchCartMock.mockResolvedValue(cart([]))
    render(<CartProvider><Counter /></CartProvider>)

    await waitFor(() => expect(screen.getByText('0 positions / 0 lignes')).toBeInTheDocument())
    expect(fetchCartMock).not.toHaveBeenCalled()
  })
})
