import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Suppliers from './Suppliers.jsx'

vi.mock('../../services/suppliers.service.js', () => ({
  getSuppliers:   vi.fn(),
  deleteSupplier: vi.fn(),
}))
vi.mock('../../contexts/ToastContext.jsx', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

import { getSuppliers } from '../../services/suppliers.service.js'

/* Jeu représentatif : les fiches créées depuis le fichier catalogue n'ont que
   leur nom, une seule porte des coordonnées complètes. */
const SUPPLIERS = [
  { id: 1, name: 'Artibalta', contact_name: null, email: null, phone: null,
    product_count: 4444, is_active: 1 },
  { id: 2, name: 'DMC sas', contact_name: 'Marie Dupont', email: 'contact@dmc.fr',
    phone: '+33 1 23 45 67 89', product_count: 947, is_active: 1 },
  { id: 3, name: 'CL Broderie', contact_name: null, email: null, phone: null,
    product_count: 0, is_active: 0 },
]

const renderPage = (path = '/fournisseurs') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Suppliers />
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  getSuppliers.mockResolvedValue({ data: SUPPLIERS, pagination: { total: SUPPLIERS.length } })
})

describe('Suppliers — tableau', () => {
  it('affiche une ligne par fournisseur avec son nombre de produits', async () => {
    renderPage()

    expect(await screen.findByText('Artibalta')).toBeInTheDocument()
    expect(screen.getByText('DMC sas')).toBeInTheDocument()
    expect(screen.getByText('4 444')).toBeInTheDocument()
    expect(screen.getByText('947')).toBeInTheDocument()
  })

  it('regroupe les coordonnées disponibles en une seule colonne', async () => {
    renderPage()
    await screen.findByText('DMC sas')

    expect(
      screen.getByText(/Marie Dupont · contact@dmc\.fr · \+33 1 23 45 67 89/)
    ).toBeInTheDocument()
  })

  /* Les 29 fiches réelles n'ont aucune coordonnée : la colonne doit inviter à
     les saisir plutôt que d'afficher un vide qui ferait croire à un bug. */
  it('signale les fiches sans aucune coordonnée', async () => {
    renderPage()
    await screen.findByText('Artibalta')

    // Deux fournisseurs sur trois sont sans coordonnées
    expect(screen.getAllByText('À compléter')).toHaveLength(2)
  })

  it('renvoie vers les produits du fournisseur depuis le compteur', async () => {
    renderPage()
    await screen.findByText('Artibalta')

    const link = screen.getByTitle('Voir les produits de Artibalta')
    expect(link).toHaveAttribute('href', '/produits?supplier_id=1')
  })

  it('distingue les fournisseurs actifs des inactifs', async () => {
    renderPage()
    await screen.findByText('CL Broderie')

    expect(screen.getAllByText('Actif')).toHaveLength(2)
    expect(screen.getByText('Inactif')).toBeInTheDocument()
  })
})

describe('Suppliers — tri par colonne', () => {
  it('trie par nombre de produits, du plus fourni au moins fourni', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Artibalta')

    await user.click(screen.getByRole('button', { name: /Produits/ }))

    await waitFor(() => {
      expect(getSuppliers).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: 'product_count', order: 'desc' })
      )
    })
  })

  it('inverse le sens au second clic sur la même colonne', async () => {
    const user = userEvent.setup()
    renderPage('/fournisseurs?sort=product_count&order=desc')
    await screen.findByText('Artibalta')

    await user.click(screen.getByRole('button', { name: /Produits/ }))

    await waitFor(() => {
      expect(getSuppliers).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: 'product_count', order: 'asc' })
      )
    })
  })

  it('trie le nom en ordre alphabétique par défaut', async () => {
    const user = userEvent.setup()
    renderPage('/fournisseurs?sort=product_count&order=desc')
    await screen.findByText('Artibalta')

    await user.click(screen.getByRole('button', { name: /Fournisseur/ }))

    await waitFor(() => {
      expect(getSuppliers).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: 'name', order: 'asc' })
      )
    })
  })
})
