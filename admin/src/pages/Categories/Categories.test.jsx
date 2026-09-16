import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Categories from './Categories.jsx'

vi.mock('../../services/categories.service.js', () => ({
  getCategories:  vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}))

vi.mock('../../contexts/ToastContext.jsx', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

import { getCategories } from '../../services/categories.service.js'

/* Arborescence de test : deux rayons racines, l'un avec une sous-catégorie.
   « Toiles » est vide, « Diamant » contient des articles à reclasser. */
const TREE = [
  { id: 1, parent_id: null, slug: 'broderie', sort_order: 1, product_count: 45, review_count: 10,
    translations: { fr: { name: 'Broderie' } } },
  { id: 10, parent_id: 1, slug: 'kits', sort_order: 1, product_count: 45, review_count: 10,
    translations: { fr: { name: 'Kits de Broderie' } } },
  { id: 2, parent_id: null, slug: 'toiles', sort_order: 2, product_count: 0, review_count: 0,
    translations: { fr: { name: 'Toiles' } } },
  { id: 3, parent_id: null, slug: 'diamant', sort_order: 3, product_count: 858, review_count: 858,
    translations: { fr: { name: 'Broderie Diamant' } } },
]

const renderPage = (initialPath = '/categories') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Categories />
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  getCategories.mockResolvedValue(TREE)
  try { localStorage.clear() } catch { /* stockage indisponible */ }
})

// ── Arborescence et accordéon ────────────────────────────────────────────────

describe('Categories — arborescence', () => {
  it('masque les sous-catégories tant que le parent est replié', async () => {
    renderPage()
    await screen.findByText('Broderie')
    expect(screen.queryByText('Kits de Broderie')).not.toBeInTheDocument()
  })

  it('déplie un rayon au clic sur le chevron', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Broderie')

    await user.click(screen.getByLabelText('Afficher les sous-catégories'))
    expect(await screen.findByText('Kits de Broderie')).toBeInTheDocument()
  })
})

// ── Recherche ────────────────────────────────────────────────────────────────

describe('Categories — recherche', () => {
  it('filtre sur le nom et garde visible l’ancêtre du résultat', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Broderie')

    await user.type(screen.getByPlaceholderText(/Rechercher par nom ou slug/), 'kits')

    // Le résultat apparaît même s'il est imbriqué, avec son parent pour le situer
    await waitFor(() => expect(screen.getByText('Kits de Broderie')).toBeInTheDocument())
    expect(screen.getByText('Broderie')).toBeInTheDocument()
    // Les rayons sans correspondance disparaissent
    expect(screen.queryByText('Toiles')).not.toBeInTheDocument()
  })

  it('propose d’effacer les critères quand rien ne correspond', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Broderie')

    await user.type(screen.getByPlaceholderText(/Rechercher par nom ou slug/), 'zzzz')

    expect(await screen.findByText(/Aucune catégorie ne correspond/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Effacer la recherche et les filtres/ })).toBeInTheDocument()
  })
})

// ── Filtres ──────────────────────────────────────────────────────────────────

describe('Categories — filtres', () => {
  it('le raccourci « Vides » ne garde que les rayons sans produit', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Broderie')

    await user.click(screen.getByRole('button', { name: /Vides/ }))

    await waitFor(() => expect(screen.getByText('Toiles')).toBeInTheDocument())
    expect(screen.queryByText('Broderie Diamant')).not.toBeInTheDocument()
  })

  it('le raccourci « À reclasser » ne garde que les rayons concernés', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Broderie')

    await user.click(screen.getByRole('button', { name: /À reclasser/ }))

    await waitFor(() => expect(screen.getByText('Broderie Diamant')).toBeInTheDocument())
    expect(screen.queryByText('Toiles')).not.toBeInTheDocument()
  })

  it('affiche une puce retirable pour chaque filtre actif', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Broderie')

    await user.click(screen.getByRole('button', { name: /Vides/ }))
    const chip = await screen.findByRole('button', { name: /Contenu\s*Vides/ })

    // Le clic sur la puce retire le filtre
    await user.click(chip)
    await waitFor(() => expect(screen.getByText('Broderie Diamant')).toBeInTheDocument())
  })

  it('filtre par niveau depuis le panneau', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Broderie')

    await user.click(screen.getByRole('button', { name: /Filtres/ }))
    await user.selectOptions(screen.getByLabelText('Niveau'), '1')

    // Seule la sous-catégorie de niveau 1 reste
    await waitFor(() => expect(screen.getByText('Kits de Broderie')).toBeInTheDocument())
  })

  it('restaure les filtres portés par l’URL', async () => {
    renderPage('/categories?content=empty')
    await screen.findByText('Toiles')
    expect(screen.queryByText('Broderie Diamant')).not.toBeInTheDocument()
  })
})

// ── Tri ──────────────────────────────────────────────────────────────────────

describe('Categories — tri', () => {
  it('met la hiérarchie à plat et le signale', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Broderie')

    await user.click(screen.getByRole('button', { name: /Produits/ }))

    // Toutes les catégories deviennent visibles, sans accordéon
    await waitFor(() => expect(screen.getByText('Kits de Broderie')).toBeInTheDocument())
    expect(screen.getByText(/l’arborescence est masquée/)).toBeInTheDocument()
  })

  it('revient à l’arborescence depuis le bandeau', async () => {
    const user = userEvent.setup()
    renderPage('/categories?sort=products&order=asc')
    await screen.findByText('Kits de Broderie')

    await user.click(screen.getByRole('button', { name: /Revenir à l’arborescence/ }))

    // L'accordéon reprend : la sous-catégorie est de nouveau masquée
    await waitFor(() => expect(screen.queryByText('Kits de Broderie')).not.toBeInTheDocument())
  })
})

// ── Compteurs et actions ─────────────────────────────────────────────────────

describe('Categories — affichage', () => {
  it('affiche le nombre d’articles à reclasser sur les rayons concernés', async () => {
    renderPage()
    await screen.findByText('Broderie Diamant')
    expect(screen.getByText(/858 à reclasser/)).toBeInTheDocument()
  })

  it('résume les rayons vides sous le titre', async () => {
    renderPage()
    await screen.findByText('Broderie')
    expect(screen.getByText(/1 sans produit/)).toBeInTheDocument()
  })

  it('lie chaque rayon vers ses produits', async () => {
    renderPage()
    await screen.findByText('Broderie Diamant')
    const link = screen.getByLabelText('Voir les produits de Broderie Diamant')
    expect(link).toHaveAttribute('href', '/produits?category_id=3')
  })

  it('interdit la suppression d’un rayon qui contient des produits', async () => {
    renderPage()
    await screen.findByText('Broderie Diamant')

    const rows = screen.getAllByRole('button', { name: 'Supprimer' })
    // « Toiles » est vide : sa suppression est la seule autorisée
    const enabled = rows.filter(b => !b.disabled)
    expect(enabled).toHaveLength(1)
  })
})
