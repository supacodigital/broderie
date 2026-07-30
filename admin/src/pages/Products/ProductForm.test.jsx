import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ProductForm from './ProductForm.jsx'

vi.mock('../../services/products.service.js', () => ({
  getProductById:     vi.fn(),
  createProduct:      vi.fn(),
  updateProduct:      vi.fn(),
  uploadProductImage: vi.fn(),
  deleteProductImage: vi.fn(),
  setPrimaryImage:    vi.fn(),
}))
vi.mock('../../services/categories.service.js', () => ({ getCategories: vi.fn() }))
vi.mock('../../services/suppliers.service.js', () => ({ getSuppliers: vi.fn() }))
vi.mock('../../services/settings.service.js', () => ({ getTaxRates: vi.fn() }))
vi.mock('../../services/tags.service.js', () => ({ getTags: vi.fn() }))

const toastSuccess = vi.fn()
vi.mock('../../contexts/ToastContext.jsx', () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn() }),
}))

import { getProductById, createProduct, updateProduct } from '../../services/products.service.js'
import { getCategories } from '../../services/categories.service.js'
import { getSuppliers } from '../../services/suppliers.service.js'
import { getTaxRates } from '../../services/settings.service.js'
import { getTags } from '../../services/tags.service.js'

const TAX_RATES = [{ id: 1, name: 'Taux normal', rate: 8.1, is_default: 1 }]

function renderForm({ id } = {}) {
  const initialPath = id ? `/produits/${id}` : '/produits/nouveau'
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/produits/nouveau" element={<ProductForm />} />
        <Route path="/produits/:id" element={<ProductForm />} />
      </Routes>
    </MemoryRouter>
  )
}

async function fillRequiredFields(user) {
  await screen.findByRole('option', { name: 'Kits' })
  await user.selectOptions(screen.getByLabelText(/Catégorie/), '1')
  await user.type(screen.getByLabelText(/Nom du produit/), 'Kit broderie fleurs')
  await user.type(screen.getByLabelText(/SKU/), 'SKU-001')
}

beforeEach(() => {
  vi.clearAllMocks()
  getCategories.mockResolvedValue([{ id: 1, parent_id: null, slug: 'kits', translations: { fr: { name: 'Kits' } } }])
  getSuppliers.mockResolvedValue({ data: [] })
  getTaxRates.mockResolvedValue(TAX_RATES)
  getTags.mockResolvedValue([])
})

describe('ProductForm — champ Prix de vente', () => {
  it('reste inchangé quand une réduction est appliquée', async () => {
    const user = userEvent.setup()
    renderForm()

    const priceInput = await screen.findByLabelText(/Prix de vente/)
    await user.type(priceInput, '100')

    await user.selectOptions(screen.getByLabelText(/Réduction/), 'percent')
    const discountInput = screen.getByLabelText(/Valeur de la réduction/)
    await user.type(discountInput, '20')

    expect(priceInput).toHaveValue(100)
  })
})

describe('ProductForm — aperçu boutique', () => {
  it("n'affiche rien tant qu'aucune réduction n'est choisie", async () => {
    const user = userEvent.setup()
    renderForm()
    const priceInput = await screen.findByLabelText(/Prix de vente/)
    await user.type(priceInput, '100')

    expect(screen.queryByText('Aperçu boutique')).not.toBeInTheDocument()
  })

  it('calcule le prix final avec une réduction en pourcentage', async () => {
    const user = userEvent.setup()
    renderForm()

    const priceInput = await screen.findByLabelText(/Prix de vente/)
    await user.type(priceInput, '100')
    await user.selectOptions(screen.getByLabelText(/Réduction/), 'percent')
    await user.type(screen.getByLabelText(/Valeur de la réduction/), '20')

    expect(await screen.findByText('Aperçu boutique')).toBeInTheDocument()
    expect(screen.getByText('CHF 100.00')).toBeInTheDocument()
    expect(screen.getByText('CHF 80.00')).toBeInTheDocument()
  })

  it('calcule le prix final avec une réduction en montant fixe', async () => {
    const user = userEvent.setup()
    renderForm()

    const priceInput = await screen.findByLabelText(/Prix de vente/)
    await user.type(priceInput, '100')
    await user.selectOptions(screen.getByLabelText(/Réduction/), 'fixed')
    await user.type(screen.getByLabelText(/Valeur de la réduction/), '15')

    expect(await screen.findByText('CHF 85.00')).toBeInTheDocument()
  })

  it('arrondit le prix final au 0.05 CHF le plus proche', async () => {
    const user = userEvent.setup()
    renderForm()

    const priceInput = await screen.findByLabelText(/Prix de vente/)
    await user.type(priceInput, '99.90')
    await user.selectOptions(screen.getByLabelText(/Réduction/), 'percent')
    await user.type(screen.getByLabelText(/Valeur de la réduction/), '15')
    // 99.90 * 0.85 = 84.915 → arrondi au 0.05 le plus proche = 84.90
    expect(await screen.findByText('CHF 84.90')).toBeInTheDocument()
  })

  it('affiche un avertissement si la réduction rend le prix final négatif ou nul', async () => {
    const user = userEvent.setup()
    renderForm()

    const priceInput = await screen.findByLabelText(/Prix de vente/)
    await user.type(priceInput, '50')
    await user.selectOptions(screen.getByLabelText(/Réduction/), 'fixed')
    await user.type(screen.getByLabelText(/Valeur de la réduction/), '100')

    expect(await screen.findByText(/Réduction invalide/)).toBeInTheDocument()
    expect(screen.queryByText('CHF 50.00')).not.toBeInTheDocument()
  })
})

describe('ProductForm — soumission avec réduction', () => {
  it('envoie priceChf = prix final calculé et comparePriceChf = prix de vente saisi', async () => {
    const user = userEvent.setup()
    createProduct.mockResolvedValue({ id: 42 })
    renderForm()

    await fillRequiredFields(user)
    const priceInput = screen.getByLabelText(/Prix de vente/)
    await user.type(priceInput, '100')
    await user.selectOptions(screen.getByLabelText(/Réduction/), 'percent')
    await user.type(screen.getByLabelText(/Valeur de la réduction/), '20')

    await user.click(screen.getByRole('button', { name: 'Créer le produit' }))

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1))
    const payload = createProduct.mock.calls[0][0]
    expect(payload.priceChf).toBe(80)
    expect(payload.comparePriceChf).toBe(100)
  })

  it('envoie comparePriceChf = null quand aucune réduction n\'est choisie', async () => {
    const user = userEvent.setup()
    createProduct.mockResolvedValue({ id: 42 })
    renderForm()

    await fillRequiredFields(user)
    await user.type(screen.getByLabelText(/Prix de vente/), '75')

    await user.click(screen.getByRole('button', { name: 'Créer le produit' }))

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1))
    const payload = createProduct.mock.calls[0][0]
    expect(payload.priceChf).toBe(75)
    expect(payload.comparePriceChf).toBeNull()
  })
})

describe('ProductForm — édition d\'un produit avec réduction existante', () => {
  it('reconstitue le mode pourcentage et pré-remplit le prix de vente avec l\'ancien prix', async () => {
    getProductById.mockResolvedValue({
      id: 7,
      name: 'Produit promo',
      sku: 'SKU-007',
      price_chf: 80,
      compare_price_chf: 100,
      stock: 5,
      category_id: 1,
      tax_rate_id: 1,
      images: [],
      tags: [],
    })

    renderForm({ id: 7 })

    const priceInput = await screen.findByLabelText(/Prix de vente/)
    expect(priceInput).toHaveValue(100)
    expect(screen.getByLabelText(/Réduction/)).toHaveValue('percent')
    expect(await screen.findByText('CHF 80.00')).toBeInTheDocument()
  })

  it("n'active aucune réduction si compare_price_chf est absent", async () => {
    getProductById.mockResolvedValue({
      id: 8,
      name: 'Produit simple',
      sku: 'SKU-008',
      price_chf: 50,
      compare_price_chf: null,
      stock: 3,
      category_id: 1,
      tax_rate_id: 1,
      images: [],
      tags: [],
    })

    renderForm({ id: 8 })

    const priceInput = await screen.findByLabelText(/Prix de vente/)
    expect(priceInput).toHaveValue(50)
    expect(screen.getByLabelText(/Réduction/)).toHaveValue('none')
  })
})
