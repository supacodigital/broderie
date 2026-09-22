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

describe('ProductForm — champ Prix de vente', () => {
  it('reste inchangé quand une réduction est appliquée', async () => {
    const user = userEvent.setup()
    renderForm()

    const priceInput = await screen.findByLabelText(/Prix de vente/)
    await user.type(priceInput, '100')

    await user.selectOptions(screen.getByLabelText(/Appliquer une remise/), 'percent')
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
    await user.type(priceInput, '80')

    expect(screen.queryByText('Aperçu boutique')).not.toBeInTheDocument()
  })

  /* ADM-03 — la remise DESCEND le prix. Le constat de la cliente était qu'appliquer
     un rabais majorait le prix affiché : saisir 100 et -25 % donnait un prix barré à
     133.35. Le prix saisi est désormais le prix catalogue, et la remise s'en déduit. */
  it('déduit le prix payé du prix de vente avec une réduction en pourcentage', async () => {
    const user = userEvent.setup()
    renderForm()

    const priceInput = await screen.findByLabelText(/Prix de vente/)
    await user.type(priceInput, '100')
    await user.selectOptions(screen.getByLabelText(/Appliquer une remise/), 'percent')
    await user.type(screen.getByLabelText(/Valeur de la réduction/), '25')

    expect(await screen.findByText('Aperçu boutique')).toBeInTheDocument()
    // 100 CHF moins 25 % = 75 CHF payés, 100 CHF barrés
    expect(screen.getAllByText('CHF 100.00').length).toBeGreaterThan(0)
    expect(screen.getAllByText('CHF 75.00').length).toBeGreaterThan(0)
    // Le prix jamais affiché : celui qu'un calcul inversé produirait
    expect(screen.queryByText('CHF 133.35')).not.toBeInTheDocument()
  })

  it('déduit le prix payé du prix de vente avec une réduction en montant fixe', async () => {
    const user = userEvent.setup()
    renderForm()

    const priceInput = await screen.findByLabelText(/Prix de vente/)
    await user.type(priceInput, '100')
    await user.selectOptions(screen.getByLabelText(/Appliquer une remise/), 'fixed')
    await user.type(screen.getByLabelText(/Valeur de la réduction/), '15')

    // 100 CHF moins 15 CHF = 85 CHF payés
    expect((await screen.findAllByText('CHF 85.00')).length).toBeGreaterThan(0)
  })

  it('arrondit le prix payé au 0.05 CHF le plus proche', async () => {
    const user = userEvent.setup()
    renderForm()

    const priceInput = await screen.findByLabelText(/Prix de vente/)
    await user.type(priceInput, '99.90')
    await user.selectOptions(screen.getByLabelText(/Appliquer une remise/), 'percent')
    await user.type(screen.getByLabelText(/Valeur de la réduction/), '15')
    // 99.90 × 0.85 = 84.915 → arrondi au 0.05 le plus proche = 84.90
    expect((await screen.findAllByText('CHF 84.90')).length).toBeGreaterThan(0)
  })

  it('refuse une remise qui ne laisse aucun prix payé valide', async () => {
    const user = userEvent.setup()
    renderForm()

    const priceInput = await screen.findByLabelText(/Prix de vente/)
    await user.type(priceInput, '50')
    await user.selectOptions(screen.getByLabelText(/Appliquer une remise/), 'fixed')
    // Une remise de 50 CHF sur 50 CHF ramènerait le prix payé à zéro
    await user.type(screen.getByLabelText(/Valeur de la réduction/), '50')

    expect(await screen.findByText(/Remise invalide/)).toBeInTheDocument()
  })
})

describe('ProductForm — soumission avec réduction', () => {
  /* Répartition dans les colonnes : le prix catalogue saisi part dans
     compare_price_chf (barré) et le prix remisé dans price_chf (payé). */
  it('envoie priceChf = prix remisé et comparePriceChf = prix catalogue saisi', async () => {
    const user = userEvent.setup()
    createProduct.mockResolvedValue({ id: 42 })
    renderForm()

    await fillRequiredFields(user)
    const priceInput = screen.getByLabelText(/Prix de vente/)
    await user.type(priceInput, '100')
    await user.selectOptions(screen.getByLabelText(/Appliquer une remise/), 'percent')
    await user.type(screen.getByLabelText(/Valeur de la réduction/), '25')

    await user.click(screen.getByRole('button', { name: 'Créer le produit' }))

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1))
    const payload = createProduct.mock.calls[0][0]
    expect(payload.priceChf).toBe(75)
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
  /* Le champ affiche le PRIX CATALOGUE (compare_price_chf ici), pas le prix promo.
     Afficher price_chf remettrait 80 dans un champ qui signifie « prix de vente » :
     un simple enregistrement sans rien modifier rebaisserait le prix à 60 CHF, puis
     45, à chaque passage sur la fiche. */
  it('affiche le prix catalogue et reconstitue le pourcentage de remise', async () => {
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

    const priceInput = await screen.findByLabelText(/Prix de vente/)
    expect(priceInput).toHaveValue(100)
    expect(screen.getByLabelText(/Appliquer une remise/)).toHaveValue('percent')
    // L'aperçu montre les deux prix réels de la base : 100 barré, 80 payé
    expect((await screen.findAllByText('CHF 100.00')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('CHF 80.00')).length).toBeGreaterThan(0)
  })

  /* Non-régression : rouvrir une fiche en promotion puis l'enregistrer sans rien
     changer doit renvoyer EXACTEMENT les mêmes prix. C'est le scénario qui érodait
     le prix à chaque passage. */
  it('réenregistre les mêmes prix quand la fiche est ouverte puis soumise sans modification', async () => {
    const user = userEvent.setup()
    getProductById.mockResolvedValue({
      id: 9,
      name: 'Produit promo',
      sku: 'SKU-009',
      price_chf: 80,
      compare_price_chf: 100,
      stock: 5,
      category_id: 1,
      tax_rate_id: 1,
      images: [],
    })
    updateProduct.mockResolvedValue({ id: 9 })

    renderForm({ id: 9 })
    await screen.findByLabelText(/Prix de vente/)
    await user.click(screen.getByRole('button', { name: /Enregistrer/i }))

    const payload = updateProduct.mock.calls.at(-1)[1]
    expect(payload.priceChf).toBe(80)
    expect(payload.comparePriceChf).toBe(100)
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

    const priceInput = await screen.findByLabelText(/Prix de vente/)
    expect(priceInput).toHaveValue(50)
    expect(screen.getByLabelText(/Appliquer une remise/)).toHaveValue('none')
  })
})

// ── Rayons supplémentaires (ADM-04) ──────────────────────────────────────────

describe('ProductForm — rayons supplémentaires', () => {
  const CATEGORIES = [
    { id: 1, parent_id: null, slug: 'kits',     translations: { fr: { name: 'Kits' } } },
    { id: 2, parent_id: null, slug: 'diamant',  translations: { fr: { name: 'Diamant' } } },
    { id: 3, parent_id: null, slug: 'toiles',   translations: { fr: { name: 'Toiles' } } },
  ]

  it('envoie les rayons cochés à la création', async () => {
    const user = userEvent.setup()
    getCategories.mockResolvedValue(CATEGORIES)
    createProduct.mockResolvedValue({ id: 20 })

    renderForm()

    await screen.findByRole('option', { name: 'Kits' })
    await user.selectOptions(screen.getByLabelText(/Catégorie principale/), '1')
    await user.type(screen.getByLabelText(/Nom du produit/), 'Kit fleurs')
    await user.type(screen.getByLabelText(/SKU/), 'SKU-020')
    await user.type(screen.getByLabelText(/Prix de vente/), '30')

    // La catégorie principale n'est pas proposée comme rayon supplémentaire
    expect(screen.queryByRole('checkbox', { name: 'Kits' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Diamant' }))
    await user.click(screen.getByRole('button', { name: /Créer|Enregistrer/ }))

    await waitFor(() => expect(createProduct).toHaveBeenCalled())
    expect(createProduct.mock.calls[0][0]).toMatchObject({
      categoryId: 1,
      secondaryCategoryIds: [2],
    })
  })

  it('reprend les rayons existants en édition', async () => {
    getCategories.mockResolvedValue(CATEGORIES)
    getProductById.mockResolvedValue({
      id: 9, name: 'Kit existant', sku: 'SKU-009',
      price_chf: 40, stock: 2, category_id: 1, tax_rate_id: 1,
      secondary_category_ids: [3],
      images: [],
    })

    renderForm({ id: 9 })

    const toiles = await screen.findByRole('checkbox', { name: 'Toiles' })
    expect(toiles).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Diamant' })).not.toBeChecked()
  })

  it('retire des rayons supplémentaires la catégorie promue en principale', async () => {
    const user = userEvent.setup()
    getCategories.mockResolvedValue(CATEGORIES)
    getProductById.mockResolvedValue({
      id: 10, name: 'Kit existant', sku: 'SKU-010',
      price_chf: 40, stock: 2, category_id: 1, tax_rate_id: 1,
      secondary_category_ids: [2],
      images: [],
    })
    updateProduct.mockResolvedValue({ id: 10 })

    renderForm({ id: 10 })

    expect(await screen.findByRole('checkbox', { name: 'Diamant' })).toBeChecked()

    // Diamant devient la catégorie principale : il ne doit plus être un rayon secondaire
    await user.selectOptions(screen.getByLabelText(/Catégorie principale/), '2')

    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: 'Diamant' })).not.toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: /Enregistrer|Créer/ }))
    await waitFor(() => expect(updateProduct).toHaveBeenCalled())
    expect(updateProduct.mock.calls[0][1]).toMatchObject({
      categoryId: 2,
      secondaryCategoryIds: [],
    })
  })
})
