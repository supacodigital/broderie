import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

/* Menu latéral (26.09) : rubriques par usage, tiroir mobile qui se referme,
   repli en icônes mémorisé, onglets des paramètres choisis depuis le menu. */
let mockUser = null
vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: mockUser,
    isSuperAdmin: mockUser?.role === 'super_admin',
    logout: vi.fn(),
  }),
}))

vi.mock('../../services/orders.service.js', () => ({ getOrders: vi.fn().mockResolvedValue({ pagination: { total: 3 } }) }))
vi.mock('../../services/reviews.service.js', () => ({ getReviews: vi.fn().mockResolvedValue({ pagination: { total: 0 } }) }))
vi.mock('../../services/products.service.js', () => ({ getProducts: vi.fn().mockResolvedValue({ pagination: { total: 0 } }) }))

import AdminLayout from './AdminLayout.jsx'
import { UnsavedChangesProvider, useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx'

/* Page Paramètres factice : affiche l'onglet ouvert et, pour les onglets de
   `dirtyTabs`, signale une saisie en cours comme le ferait un formulaire. */
let dirtyTabs = new Set()
function FakeSettings() {
  const onglet = new URLSearchParams(useLocation().search).get('onglet') ?? 'store'
  const { setDirty } = useUnsavedChanges()
  useEffect(() => { if (dirtyTabs.has(onglet)) setDirty(true) }, [onglet, setDirty])
  return <p>Page paramètres : {onglet}</p>
}

const renderAt = (path) => render(
  <UnsavedChangesProvider>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<AdminLayout />}>
          <Route path="dashboard" element={<p>Page tableau de bord</p>} />
          <Route path="commandes" element={<p>Page commandes</p>} />
          <Route path="contenu" element={<p>Page contenu</p>} />
          <Route path="parametres" element={<FakeSettings />} />
        </Route>
      </Routes>
    </MemoryRouter>
  </UnsavedChangesProvider>,
)

const menu = () => screen.getByRole('navigation', { name: 'Menu principal' })
// Liens visibles : ceux d'une liste refermée (inert) ne comptent pas
const linkLabels = () => within(menu()).getAllByRole('link')
  .filter((a) => !a.closest('[inert]'))
  .map((a) => a.textContent)
const settingsButton = () => within(menu()).getByRole('button', { name: 'Paramètres' })

beforeEach(() => {
  localStorage.clear()
  dirtyTabs = new Set()
  mockUser = { id: 1, role: 'admin', firstName: 'Julie', lastName: 'G' }
})

describe('Rubriques', () => {
  it('administratrice : tableau de bord, ventes, catalogue, marketing, puis Paramètres en fin de liste', async () => {
    renderAt('/dashboard')
    // Le badge des nouvelles commandes arrive après le chargement
    expect(await within(menu()).findByText('3')).toBeInTheDocument()

    for (const title of ['Ventes', 'Catalogue', 'Marketing']) {
      expect(within(menu()).getByText(title)).toBeInTheDocument()
    }
    expect(within(menu()).queryByText('Outils')).not.toBeInTheDocument()
    expect(linkLabels()).toEqual([
      'Tableau de bord',
      'Commandes3', 'Factures', 'Clients', 'Avis',
      'Produits', 'Catégories', 'Fournisseurs', 'Réassort',
      'Promotions', 'Fidélité', 'Newsletter',
    ])
    // Paramètres, dernier du menu : un bouton qui déroule ses onglets, refermé ailleurs
    expect(settingsButton()).toHaveAttribute('aria-expanded', 'false')
    const newsletter = within(menu()).getByRole('link', { name: 'Newsletter' })
    expect(newsletter.compareDocumentPosition(settingsButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Même zone qui défile que les autres rubriques, plus de pied épinglé
    expect(settingsButton().closest('[data-nav-scroll]')).toBe(newsletter.closest('[data-nav-scroll]'))
  })

  it('super-administrateur : tableau de bord, contenu du site, puis Mon compte en pied', () => {
    mockUser = { id: 20, role: 'super_admin', firstName: 'Super', lastName: 'Admin' }
    renderAt('/contenu')
    expect(within(menu()).getByText('Contenu du site')).toBeInTheDocument()
    expect(linkLabels()).toEqual([
      'Tableau de bord',
      'Page d’accueil', 'Notre Histoire', 'Bandeau d’annonce', 'Textes légaux', 'E-mails',
      'Mon compte',
    ])
  })
})

describe('Tiroir mobile', () => {
  it('se referme quand on choisit une page', async () => {
    const user = userEvent.setup()
    renderAt('/dashboard')
    const menuBtn = screen.getByRole('button', { name: 'Menu' })

    await user.click(menuBtn)
    expect(menuBtn).toHaveAttribute('aria-expanded', 'true')

    await user.click(within(menu()).getByRole('link', { name: /Commandes/ }))
    expect(await screen.findByText('Page commandes')).toBeInTheDocument()
    expect(menuBtn).toHaveAttribute('aria-expanded', 'false')
  })

  it('se referme avec Échap et rend le focus au bouton Menu', async () => {
    const user = userEvent.setup()
    renderAt('/dashboard')
    const menuBtn = screen.getByRole('button', { name: 'Menu' })

    await user.click(menuBtn)
    await user.keyboard('{Escape}')
    expect(menuBtn).toHaveAttribute('aria-expanded', 'false')
    expect(menuBtn).toHaveFocus()
  })
})

describe('Repli en icônes', () => {
  it('se replie, reste navigable par le nom des liens, et s\'en souvient', async () => {
    const user = userEvent.setup()
    const { unmount } = renderAt('/dashboard')

    await user.click(screen.getByRole('button', { name: 'Réduire le menu' }))
    expect(screen.getByRole('button', { name: 'Agrandir le menu' })).toBeInTheDocument()
    // Libellés masqués à l'écran mais toujours lus : les liens gardent leur nom
    expect(settingsButton()).toBeInTheDocument()
    expect(localStorage.getItem('admin.sidebarCollapsed')).toBe('1')

    unmount()
    renderAt('/dashboard')
    expect(screen.getByRole('button', { name: 'Agrandir le menu' })).toBeInTheDocument()
  })

  it('menu replié : le survol d\'une icône affiche son libellé', async () => {
    localStorage.setItem('admin.sidebarCollapsed', '1')
    const user = userEvent.setup()
    renderAt('/dashboard')

    await user.hover(within(menu()).getByRole('link', { name: 'Factures' }))
    expect(screen.getByText('Factures', { selector: '[aria-hidden="true"]' })).toBeInTheDocument()

    await user.unhover(within(menu()).getByRole('link', { name: 'Factures' }))
    expect(screen.queryByText('Factures', { selector: '[aria-hidden="true"]' })).not.toBeInTheDocument()
  })

  it('menu déplié : pas d\'info-bulle sur les liens, leur libellé est déjà affiché', async () => {
    const user = userEvent.setup()
    renderAt('/dashboard')
    await user.hover(within(menu()).getByRole('link', { name: 'Factures' }))
    expect(screen.queryByText('Factures', { selector: '[aria-hidden="true"]' })).not.toBeInTheDocument()
  })
})

describe('Paramètres — liste des onglets dans le menu', () => {
  const tabLink = (name) => within(menu()).getByRole('link', { name })

  it('le bouton déroule les onglets ; un clic ouvre l\'onglet choisi', async () => {
    const user = userEvent.setup()
    renderAt('/dashboard')

    await user.click(settingsButton())
    expect(settingsButton()).toHaveAttribute('aria-expanded', 'true')
    expect(linkLabels().slice(-6)).toEqual(['Boutique', 'Retrait', 'Livraison', 'TVA', 'Facturation', 'Sécurité'])

    await user.click(tabLink('TVA'))
    expect(await screen.findByText('Page paramètres : tax')).toBeInTheDocument()
    expect(tabLink('TVA')).toHaveAttribute('aria-current', 'page')
    expect(tabLink('Boutique')).not.toHaveAttribute('aria-current')
  })

  it('ouverte d\'office sur la page Paramètres, refermée en la quittant', async () => {
    const user = userEvent.setup()
    renderAt('/parametres?onglet=invoice')
    expect(settingsButton()).toHaveAttribute('aria-expanded', 'true')
    expect(tabLink('Facturation')).toHaveAttribute('aria-current', 'page')

    await user.click(within(menu()).getByRole('link', { name: /Commandes/ }))
    await screen.findByText('Page commandes')
    expect(settingsButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('saisie non enregistrée : confirmation avant de changer d\'onglet', async () => {
    dirtyTabs = new Set(['store'])
    const user = userEvent.setup()
    renderAt('/parametres')
    await screen.findByText('Page paramètres : store')

    await user.click(tabLink('TVA'))
    expect(screen.getByText('Vos modifications ne sont pas enregistrées. Quitter cette page ?')).toBeInTheDocument()
    await user.click(screen.getByText('Annuler', { selector: 'button' }))
    expect(screen.getByText('Page paramètres : store')).toBeInTheDocument()

    await user.click(tabLink('TVA'))
    await user.click(screen.getByRole('button', { name: 'Confirmer' }))
    expect(await screen.findByText('Page paramètres : tax')).toBeInTheDocument()
  })

  it('un clic sur l\'onglet déjà ouvert ne demande rien et garde l\'avertissement', async () => {
    dirtyTabs = new Set(['store'])
    const user = userEvent.setup()
    renderAt('/parametres')
    await screen.findByText('Page paramètres : store')

    await user.click(tabLink('Boutique'))
    expect(screen.queryByText(/Quitter cette page/)).not.toBeInTheDocument()

    // La saisie est toujours protégée
    await user.click(within(menu()).getByRole('link', { name: /Commandes/ }))
    expect(screen.getByText('Vos modifications ne sont pas enregistrées. Quitter cette page ?')).toBeInTheDocument()
  })

  it('tiroir mobile : choisir un onglet referme le menu', async () => {
    const user = userEvent.setup()
    renderAt('/parametres')
    const menuBtn = screen.getByRole('button', { name: 'Menu' })

    await user.click(menuBtn)
    await user.click(tabLink('Livraison'))
    expect(await screen.findByText('Page paramètres : shipping')).toBeInTheDocument()
    expect(menuBtn).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('Paramètres — menu replié en icônes', () => {
  beforeEach(() => { localStorage.setItem('admin.sidebarCollapsed', '1') })
  const flyout = () => screen.queryByRole('group', { name: 'Paramètres' })

  it('l\'engrenage ouvre un menu flottant ; choisir un onglet le referme', async () => {
    const user = userEvent.setup()
    renderAt('/dashboard')

    await user.click(settingsButton())
    expect(settingsButton()).toHaveAttribute('aria-expanded', 'true')
    const links = within(flyout()).getAllByRole('link').map((a) => a.textContent)
    expect(links).toEqual(['Boutique', 'Retrait', 'Livraison', 'TVA', 'Facturation', 'Sécurité'])
    // Au clavier, on est déjà dans la liste
    expect(within(flyout()).getByRole('link', { name: 'Boutique' })).toHaveFocus()

    await user.click(within(flyout()).getByRole('link', { name: 'Sécurité' }))
    expect(await screen.findByText('Page paramètres : security')).toBeInTheDocument()
    expect(flyout()).not.toBeInTheDocument()
  })

  it('sur la page Paramètres, le focus arrive sur l\'onglet ouvert', async () => {
    const user = userEvent.setup()
    renderAt('/parametres?onglet=tax')
    await user.click(settingsButton())
    expect(within(flyout()).getByRole('link', { name: 'TVA' })).toHaveFocus()
    expect(within(flyout()).getByRole('link', { name: 'TVA' })).toHaveAttribute('aria-current', 'page')
  })

  it('Échap le referme et rend le focus à l\'engrenage ; un clic ailleurs aussi', async () => {
    const user = userEvent.setup()
    renderAt('/dashboard')

    await user.click(settingsButton())
    await user.keyboard('{Escape}')
    expect(flyout()).not.toBeInTheDocument()
    expect(settingsButton()).toHaveFocus()

    await user.click(settingsButton())
    await user.click(screen.getByText('Page tableau de bord'))
    expect(flyout()).not.toBeInTheDocument()
  })

  it('le menu défile : le menu flottant se referme, il resterait décroché de l\'engrenage', async () => {
    const user = userEvent.setup()
    renderAt('/dashboard')
    await user.click(settingsButton())
    fireEvent.scroll(settingsButton().closest('[data-nav-scroll]'))
    expect(flyout()).not.toBeInTheDocument()
  })
})
