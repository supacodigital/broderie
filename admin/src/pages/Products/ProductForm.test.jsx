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

const toastSuccess = vi.fn()
vi.mock('../../contexts/ToastContext.jsx', () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn() }),
}))

import { getProductById, createProduct, updateProduct } from '../../services/products.service.js'
import { getCategories } from '../../services/categories.service.js'
import { getSuppliers } from '../../services/suppliers.service.js'
import { getTaxRates } from '../../services/settings.service.js'

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
})

describe('ProductForm — champ Prix payé par le client', () => {
  it('reste inchangé quand une réduction est appliquée', async () => {
    const user = userEvent.setup()
    renderForm()

    const priceInput = await screen.findByLabelText(/Prix payé par le client/)
    await user.type(priceInput, '100')

    await user.selectOptions(screen.getByLabelText(/Afficher un ancien prix barré/), 'percent')
    const discountInput = screen.getByLabelText(/Valeur de la réduction/)
    await user.type(discountInput, '20')

    expect(priceInput).toHaveValue(100)
  })
})

describe('ProductForm — aperçu boutique', () => {
  it("n'affiche rien tant qu'aucune réduction n'est choisie", async () => {
    const user = userEvent.setup()
    renderForm()
    const priceInput = await screen.findByLabelText(/Prix payé par le client/)
    await user.type(priceInput, '80')

    expect(screen.queryByText('Aperçu boutique')).not.toBeInTheDocument()
  })

  it('calcule le prix barré avec une réduction en pourcentage', async () => {
    const user = userEvent.setup()
    renderForm()

    const priceInput = await screen.findByLabelText(/Prix payé par le client/)
    await user.type(priceInput, '80')
    await user.selectOptions(screen.getByLabelText(/Afficher un ancien prix barré/), 'percent')
    await user.type(screen.getByLabelText(/Valeur de la réduction/), '20')

    expect(await screen.findByText('Aperçu boutique')).toBeInTheDocument()
    // prix payé 80 = prix barré × (1 - 20%) → prix barré = 80 / 0.8 = 100
    expect(screen.getAllByText('CHF 100.00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('CHF 80.00').length).toBeGreaterThan(0)
  })

  it('calcule le prix barré avec une réduction en montant fixe', async () => {
    const user = userEvent.setup()
    renderForm()

    const priceInput = await screen.findByLabelText(/Prix payé par le client/)
    await user.type(priceInput, '85')
    await user.selectOptions(screen.getByLabelText(/Afficher un ancien prix barré/), 'fixed')
    await user.type(screen.getByLabelText(/Valeur de la réduction/), '15')

    // prix barré = prix payé + montant fixe = 85 + 15 = 100
    expect((await screen.findAllByText('CHF 100.00')).length).toBeGreaterThan(0)
  })

  it('arrondit le prix barré au 0.05 CHF le plus proche', async () => {
    const user = userEvent.setup()
    renderForm()

    const priceInput = await screen.findByLabelText(/Prix payé par le client/)
    await user.type(priceInput, '84.90')
    await user.selectOptions(screen.getByLabelText(/Afficher un ancien prix barré/), 'percent')
    await user.type(screen.getByLabelText(/Valeur de la réduction/), '15')
    // 84.90 / 0.85 = 99.882… → arrondi au 0.05 le plus proche = 99.90
    expect((await screen.findAllByText('CHF 99.90')).length).toBeGreaterThan(0)
  })

  it('affiche un avertissement si la réduction en pourcentage ne donne aucun prix barré valide', async () => {
    const user = userEvent.setup()
    renderForm()

    const priceInput = await screen.findByLabelText(/Prix payé par le client/)
    await user.type(priceInput, '50')
    await user.selectOptions(screen.getByLabelText(/Afficher un ancien prix barré/), 'percent')
    await user.type(screen.getByLabelText(/Valeur de la réduction/), '0')

    expect(await screen.findByText(/Remise invalide/)).toBeInTheDocument()
  })
})

describe('ProductForm — soumission avec réduction', () => {
  it('envoie priceChf = prix de vente saisi et comparePriceChf = prix barré calculé', async () => {
    const user = userEvent.setup()
    createProduct.mockResolvedValue({ id: 42 })
    renderForm()

    await fillRequiredFields(user)
    const priceInput = screen.getByLabelText(/Prix payé par le client/)
    await user.type(priceInput, '80')
    await user.selectOptions(screen.getByLabelText(/Afficher un ancien prix barré/), 'percent')
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
    await user.type(screen.getByLabelText(/Prix payé par le client/), '75')

    await user.click(screen.getByRole('button', { name: 'Créer le produit' }))

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1))
    const payload = createProduct.mock.calls[0][0]
    expect(payload.priceChf).toBe(75)
    expect(payload.comparePriceChf).toBeNull()
  })
})

describe('ProductForm — édition d\'un produit avec réduction existante', () => {
  it('reconstitue le mode pourcentage et garde le prix de vente réel (jamais l\'ancien prix barré)', async () => {
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
    })

    renderForm({ id: 7 })

    const priceInput = await screen.findByLabelText(/Prix payé par le client/)
    expect(priceInput).toHaveValue(80)
    expect(screen.getByLabelText(/Afficher un ancien prix barré/)).toHaveValue('percent')
    expect((await screen.findAllByText('CHF 100.00')).length).toBeGreaterThan(0)
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
    })

    renderForm({ id: 8 })

    const priceInput = await screen.findByLabelText(/Prix payé par le client/)
    expect(priceInput).toHaveValue(50)
    expect(screen.getByLabelText(/Afficher un ancien prix barré/)).toHaveValue('none')
  })
})
