import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import AccountMenu from './AccountMenu.jsx'

/* Menu du compte du header : trois sections, ouverture au clic ou au survol,
   fermeture par Échap et au changement de page */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: 'fr' } }),
}))

let authValue
vi.mock('../../../contexts/AuthContext.jsx', () => ({
  useAuth: () => authValue,
}))

vi.mock('../../../contexts/WishlistContext.jsx', () => ({
  useWishlist: () => ({ ids: new Set([1, 2]) }),
}))

const getMyOrdersMock = vi.fn()
vi.mock('../../../services/orders.service.js', () => ({
  getMyOrders: (...args) => getMyOrdersMock(...args),
}))

function renderMenu(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AccountMenu />
      <Routes>
        <Route path="*" element={<Link to="/catalogue">ailleurs</Link>} />
      </Routes>
    </MemoryRouter>
  )
}

const trigger = () => screen.getByRole('button', { name: 'accountNav.menuLabel' })

beforeEach(() => {
  getMyOrdersMock.mockReset().mockResolvedValue({ pagination: { total: 3 } })
  authValue = {
    isAuthenticated: true,
    user: { first_name: 'Camille', last_name: 'Rochat', email: 'c@example.ch' },
    logout: vi.fn(),
  }
})

describe('AccountMenu', () => {
  test('affiche les initiales et les trois sections vers leurs pages', () => {
    renderMenu()
    expect(trigger()).toHaveTextContent('CR')
    fireEvent.click(trigger())

    expect(screen.getByRole('link', { name: /accountNav.profile/ })).toHaveAttribute('href', '/mon-compte/profil')
    expect(screen.getByRole('link', { name: /accountNav.orders/ })).toHaveAttribute('href', '/mon-compte/commandes')
    expect(screen.getByRole('link', { name: /accountNav.wishlist/ })).toHaveAttribute('href', '/mon-compte/favoris')
  })

  test('le clavier ouvre et referme ; Échap ferme et rend le focus au bouton', () => {
    renderMenu()
    // Clic clavier (Entrée) : pas de pointerType → bascule
    fireEvent.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(trigger())
  })

  test('le nombre de commandes est demandé à la première ouverture seulement', async () => {
    renderMenu()
    expect(getMyOrdersMock).not.toHaveBeenCalled()

    fireEvent.click(trigger())
    await waitFor(() => expect(getMyOrdersMock).toHaveBeenCalledTimes(1))

    fireEvent.click(trigger())
    fireEvent.click(trigger())
    expect(getMyOrdersMock).toHaveBeenCalledTimes(1)
  })

  test('se referme quand on change de page', () => {
    renderMenu()
    fireEvent.click(trigger())
    fireEvent.click(screen.getByText('ailleurs'))
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  test('visiteuse : propose connexion et inscription, sans appel aux commandes', () => {
    authValue = { isAuthenticated: false, user: null, logout: vi.fn() }
    renderMenu()
    fireEvent.click(trigger())

    expect(screen.getByRole('link', { name: 'accountNav.login' })).toHaveAttribute('href', '/connexion')
    expect(screen.getByRole('link', { name: 'accountNav.register' })).toHaveAttribute('href', '/inscription')
    expect(getMyOrdersMock).not.toHaveBeenCalled()
  })
})
