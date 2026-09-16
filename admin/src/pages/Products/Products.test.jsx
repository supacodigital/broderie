import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Products from './Products.jsx'

vi.mock('../../services/products.service.js', () => ({
  getProducts:   vi.fn(),
  deleteProduct: vi.fn(),
  getBrands:     vi.fn(),
}))
vi.mock('../../services/categories.service.js', () => ({ getCategories: vi.fn() }))
vi.mock('../../services/suppliers.service.js', () => ({ getSuppliers: vi.fn() }))
vi.mock('../../contexts/ToastContext.jsx', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))
vi.mock('../../hooks/useSavedViews.js', () => ({
  useSavedViews: () => ({ views: [], saveView: vi.fn(), removeView: vi.fn(), maxViews: 5 }),
}))

import { getProducts, getBrands } from '../../services/products.service.js'
import { getCategories } from '../../services/categories.service.js'
import { getSuppliers } from '../../services/suppliers.service.js'

/* Arborescence à 3 niveaux, comme en production : 5 racines, des sous-catégories
   et des catégories de niveau 3. */
const CATEGORIES = [
  { id: 1,    parent_id: null, slug: 'broderie',      translations: { fr: { name: 'Broderie' } } },
  { id: 101,  parent_id: 1,    slug: 'kits',          translations: { fr: { name: 'Kits de Broderie' } } },
  { id: 1001, parent_id: 101,  slug: 'point-croix',   translations: { fr: { name: 'Point de croix compté' } } },
  { id: 2,    parent_id: null, slug: 'fils',          translations: { fr: { name: 'Fils à broder' } } },
  { id: 105,  parent_id: 2,    slug: 'fils-coton',    translations: { fr: { name: 'Fils Coton' } } },
  { id: 1009, parent_id: 105,  slug: 'mouline',       translations: { fr: { name: 'Mouliné Spécial (Art. 117)' } } },
  { id: 5,    parent_id: null, slug: 'loisirs',       translations: { fr: { name: 'Loisirs & Strass' } } },
]

const renderPage = (path = '/produits') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Products />
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  getCategories.mockResolvedValue(CATEGORIES)
  getSuppliers.mockResolvedValue({ data: [] })
  getBrands.mockResolvedValue([])
  getProducts.mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } })
  try { localStorage.clear() } catch { /* stockage indisponible */ }
})

/* Non-régression : le filtre ne parcourait que deux niveaux. Les catégories de
   niveau 3 n'étaient trouvées sous aucune racine et se retrouvaient rejetées en
   fin de liste avec un seul tiret — « Mouliné Spécial » apparaissait donc sous
   « Loisirs & Strass » au lieu de « Fils à broder > Fils Coton ». */
describe('Products — filtre catégorie sur 3 niveaux', () => {
  const openFilters = async (user) => {
    await user.click(await screen.findByRole('button', { name: /Filtres/ }))
    // Le filtre catégorie est le premier <select> du panneau
    return document.querySelector('[role="dialog"] select')
  }

  it('propose les catégories de niveau 3, auparavant absentes du filtre', async () => {
    const user = userEvent.setup()
    renderPage()
    const select = await openFilters(user)

    const values = [...select.querySelectorAll('option')].map(o => o.value)
    // 1009 « Mouliné Spécial » et 1001 « Point de croix compté » sont de niveau 3
    expect(values).toContain('1009')
    expect(values).toContain('1001')
  })

  it('range chaque catégorie sous son vrai rayon', async () => {
    const user = userEvent.setup()
    renderPage()
    const select = await openFilters(user)

    const groups = [...select.querySelectorAll('optgroup')].map(g => ({
      rayon: g.label,
      options: [...g.querySelectorAll('option')].map(o => o.textContent.trim()),
    }))

    const broderie = groups.find(g => g.rayon === 'Broderie')
    expect(broderie.options).toEqual([
      'Broderie (tout)', 'Kits de Broderie', 'Point de croix compté',
    ])

    // « Mouliné Spécial » appartient à Fils à broder, jamais à Loisirs & Strass
    const fils = groups.find(g => g.rayon === 'Fils à broder')
    expect(fils.options).toContain('Mouliné Spécial (Art. 117)')
    const loisirs = groups.find(g => g.rayon === 'Loisirs & Strass')
    expect(loisirs.options).not.toContain('Mouliné Spécial (Art. 117)')
  })

  it('n’oublie aucune catégorie', async () => {
    const user = userEvent.setup()
    renderPage()
    const select = await openFilters(user)

    // Chaque catégorie est proposée, et une seule fois
    const values = [...select.querySelectorAll('option')].map(o => o.value).filter(Boolean)
    for (const cat of CATEGORIES) {
      expect(values.filter(v => v === String(cat.id))).toHaveLength(1)
    }
  })

  it('la puce du filtre affiche le nom sans indentation', async () => {
    renderPage('/produits?category_id=1009')

    const chip = await screen.findByRole('button', { name: /Catégorie/ })
    expect(chip.textContent).toContain('Mouliné Spécial (Art. 117)')
    expect(chip.textContent).not.toContain('—')
  })
})
