import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'

/* Espace de chaque rôle (26.09) : le super-administrateur ne voit que le
   contenu du site, l'administrateur que la gestion de la boutique. */
let mockUser = null
vi.mock('./contexts/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    isAdmin: ['admin', 'super_admin'].includes(mockUser?.role),
    isSuperAdmin: mockUser?.role === 'super_admin',
    logout: vi.fn(),
  }),
}))

vi.mock('./services/orders.service.js', () => ({ getOrders: vi.fn().mockResolvedValue({ pagination: { total: 0 } }) }))
vi.mock('./services/reviews.service.js', () => ({ getReviews: vi.fn().mockResolvedValue({ pagination: { total: 0 } }) }))
vi.mock('./services/products.service.js', () => ({ getProducts: vi.fn().mockResolvedValue({ pagination: { total: 0 } }) }))

vi.mock('./pages/Dashboard/Dashboard.jsx', () => ({ default: () => <p>Page tableau de bord boutique</p> }))
vi.mock('./pages/Account/Account.jsx', () => ({ default: () => <p>Page mon compte</p> }))
/* Page de contenu factice : signale une saisie en cours, comme un éditeur dont
   un champ a été modifié sans être enregistré. */
vi.mock('./pages/Content/Content.jsx', async () => {
  const { useParams } = await import('react-router-dom')
  const { useUnsavedChanges } = await import('./contexts/UnsavedChangesContext.jsx')
  return {
    default: function FakeContent() {
      const { section } = useParams()
      const { setDirty } = useUnsavedChanges()
      useEffect(() => { if (section === 'accueil') setDirty(true) }, [section, setDirty])
      return <p>Page contenu : {section ?? 'tableau de bord'}</p>
    },
  }
})

import App from './App.jsx'
import { getOrders } from './services/orders.service.js'

const renderAt = (path) => {
  window.history.pushState({}, '', `/admin${path}`)
  return render(<App />)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Super-administrateur — contenu du site uniquement', () => {
  beforeEach(() => { mockUser = { id: 20, role: 'super_admin', firstName: 'Super', lastName: 'Admin' } })

  it('une page de la boutique (tableau de bord, commandes) le renvoie vers le contenu', async () => {
    renderAt('/commandes')
    expect(await screen.findByText('Page contenu : tableau de bord')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/admin/contenu')
  })

  it('menu : contenu du site et compte, sans commandes ni clientes ni notifications', async () => {
    renderAt('/contenu')
    await screen.findByText('Page contenu : tableau de bord')
    for (const label of ['Page d’accueil', 'Notre Histoire', 'Bandeau d’annonce', 'Textes légaux', 'E-mails', 'Mon compte']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(screen.queryByRole('link', { name: /Commandes/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Clients' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Notifications' })).not.toBeInTheDocument()
    // Aucune interrogation des commandes (le serveur répondrait 403)
    expect(getOrders).not.toHaveBeenCalled()
  })

  it('modifications non enregistrées : le menu demande confirmation avant de quitter la page', async () => {
    const user = userEvent.setup()
    renderAt('/contenu/accueil')
    await screen.findByText('Page contenu : accueil')

    await user.click(screen.getByRole('link', { name: 'Notre Histoire' }))
    expect(screen.getByText('Vos modifications ne sont pas enregistrées. Quitter cette page ?')).toBeInTheDocument()
    expect(screen.getByText('Page contenu : accueil')).toBeInTheDocument()

    // Annuler : on reste sur la page, la saisie est intacte
    await user.click(screen.getByText('Annuler', { selector: 'button' }))
    expect(screen.getByText('Page contenu : accueil')).toBeInTheDocument()

    // Confirmer : on quitte
    await user.click(screen.getByRole('link', { name: 'Notre Histoire' }))
    await user.click(screen.getByRole('button', { name: 'Confirmer' }))
    expect(await screen.findByText('Page contenu : notre-histoire')).toBeInTheDocument()
  })
})

describe('Administrateur — gestion de la boutique, sans le contenu du site', () => {
  beforeEach(() => { mockUser = { id: 1, role: 'admin', firstName: 'Julie', lastName: 'G' } })

  it('le contenu du site le renvoie vers son tableau de bord', async () => {
    renderAt('/contenu/accueil')
    expect(await screen.findByText('Page tableau de bord boutique')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/admin/dashboard')
  })

  it('garde son menu habituel et ses notifications', async () => {
    renderAt('/dashboard')
    await screen.findByText('Page tableau de bord boutique')
    expect(screen.getByRole('link', { name: /Commandes/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Page d’accueil' })).not.toBeInTheDocument()
    await waitFor(() => expect(getOrders).toHaveBeenCalled())
  })
})
