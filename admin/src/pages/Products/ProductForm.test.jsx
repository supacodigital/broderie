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

  /* Non-régression ADM-03 (23/09) : le pourcentage reconstitué était arrondi à
     l'entier. 59.00 barré / 53.00 payé s'affichait « −10 % » et l'enregistrement
     recalculait 53.10 — le prix MONTAIT sans que personne n'ait touché à la
     remise. 1 473 promotions sur 2 268 étaient concernées. */
  it('reprend en CHF une remise qui ne tombe pas sur un pourcentage entier', async () => {
    const user = userEvent.setup()
    getProductById.mockResolvedValue({
      id: 10,
      name: 'Kit Permin',
      sku: 'PE34-4215',
      price_chf: '53.00',
      compare_price_chf: '59.00',
      stock: 5,
      category_id: 1,
      tax_rate_id: 1,
      images: [],
    })
    updateProduct.mockResolvedValue({ id: 10 })

    renderForm({ id: 10 })
    await screen.findByLabelText(/Prix de vente/)
    expect(screen.getByLabelText(/Appliquer une remise/)).toHaveValue('fixed')
    await user.click(screen.getByRole('button', { name: /Enregistrer/i }))

    const payload = updateProduct.mock.calls.at(-1)[1]
    expect(payload.priceChf).toBe(53)
    expect(payload.comparePriceChf).toBe(59)
  })

  it('garde le pourcentage quand il redonne exactement le prix payé (moulinés DMC)', async () => {
    const user = userEvent.setup()
    getProductById.mockResolvedValue({
      id: 11,
      name: 'Mouliné DMC 310',
      sku: '117-310',
      price_chf: '1.50',
      compare_price_chf: '2.00',
      stock: 50,
      category_id: 1,
      tax_rate_id: 1,
      images: [],
    })
    updateProduct.mockResolvedValue({ id: 11 })

    renderForm({ id: 11 })
    await screen.findByLabelText(/Prix de vente/)
    expect(screen.getByLabelText(/Appliquer une remise/)).toHaveValue('percent')
    await user.click(screen.getByRole('button', { name: /Enregistrer/i }))

    const payload = updateProduct.mock.calls.at(-1)[1]
    expect(payload.priceChf).toBe(1.5)
    expect(payload.comparePriceChf).toBe(2)
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

/* Vente à la coupe — trames et bandes à broder (ADM-12).

   Le backend savait déjà vendre au mètre par tranches de 10 cm, mais rien n'en
   était accessible depuis l'administration : ni affichage, ni réglage. Julie ne
   pouvait pas ajuster le pas ni le minimum d'une bande, d'où son « non conforme ». */
describe('ProductForm — vente à la coupe (ADM-12)', () => {
  it('masque les réglages de découpe tant que la case n\'est pas cochée', async () => {
    renderForm()
    await screen.findByLabelText(/Prix de vente/)

    expect(screen.queryByLabelText(/Vendu par tranches de/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Longueur minimale/)).not.toBeInTheDocument()
  })

  it('révèle le pas et le minimum quand la vente à la coupe est activée', async () => {
    const user = userEvent.setup()
    renderForm()
    await screen.findByLabelText(/Prix de vente/)

    await user.click(screen.getByLabelText(/Vendu à la coupe/))

    expect(await screen.findByLabelText(/Vendu par tranches de/)).toHaveValue(10)
    expect(screen.getByLabelText(/Longueur minimale/)).toHaveValue(50)
  })

  /* L'aperçu est ce qui permet de repérer un prix au mètre saisi par erreur
     comme un prix à l'unité : 16.50/m donne 8.25 pour la longueur minimale. */
  it('annonce le prix réellement payé pour la longueur minimale', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(await screen.findByLabelText(/Prix de vente/), '16.50')
    await user.click(screen.getByLabelText(/Vendu à la coupe/))

    // 16.50/m × 50 cm = 8.25, et une tranche de 10 cm vaut 1.65
    expect(await screen.findByText(/CHF 8\.25/)).toBeInTheDocument()
    expect(screen.getByText(/CHF 1\.65/)).toBeInTheDocument()
  })

  /* Pendant une promotion en cours, la boutique vend au prix en action :
     l'encart annonçait le prix normal (50 cm pour CHF 10.75 au lieu de 9.00). */
  it('annonce le prix en action pendant une promotion en cours', async () => {
    getProductById.mockResolvedValue({
      id: 2742, name: 'Zweigart, bande à broder Lin ficelle 20cm', sku: '72022-53-19',
      price_chf: '18.00', compare_price_chf: '21.50', is_promo_active: 1,
      promo_starts_at: null, promo_ends_at: null,
      sold_by_length: 1, length_step_cm: 10, length_min_cm: 50, stock: 700,
      category_id: 1, tax_rate_id: 1, images: [],
    })
    renderForm({ id: 2742 })

    const preview = await screen.findByText(/Commande minimale/)
    expect(preview).toHaveTextContent('Commande minimale : 50 cm pour CHF 9.00 (en action — CHF 10.75 au prix normal).')
    expect(preview).toHaveTextContent('Chaque tranche de 10 cm coûte CHF 1.80.')
  })

  /* Un minimum qui n'est pas un multiple du pas est refusé par le serveur :
     avec un pas de 10 et un minimum de 55, la boutique vendrait 60 cm alors que
     la fiche annonce 55. Autant le signaler avant l'enregistrement. */
  it('signale un minimum qui n\'est pas un multiple du pas', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(await screen.findByLabelText(/Prix de vente/), '16.50')
    await user.click(screen.getByLabelText(/Vendu à la coupe/))

    const minInput = await screen.findByLabelText(/Longueur minimale/)
    await user.clear(minInput)
    await user.type(minInput, '55')

    expect(await screen.findByText(/multiple de 10 cm/)).toBeInTheDocument()
  })

  it('envoie les paramètres de découpe quand la case est cochée', async () => {
    const user = userEvent.setup()
    createProduct.mockResolvedValue({ id: 51 })
    renderForm()

    await fillRequiredFields(user)
    await user.type(screen.getByLabelText(/Prix de vente/), '16.50')
    await user.click(screen.getByLabelText(/Vendu à la coupe/))
    await user.click(screen.getByRole('button', { name: 'Créer le produit' }))

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1))
    const payload = createProduct.mock.calls.at(-1)[0]
    expect(payload.soldByLength).toBe(true)
    expect(payload.lengthStepCm).toBe(10)
    expect(payload.lengthMinCm).toBe(50)
  })

  /* Un article vendu à l'unité ne doit pas emporter de pas de découpe : la
     valeur traînerait en base et réapparaîtrait si la case était cochée plus tard. */
  it('n\'envoie aucun paramètre de découpe pour un article vendu à l\'unité', async () => {
    const user = userEvent.setup()
    createProduct.mockResolvedValue({ id: 52 })
    renderForm()

    await fillRequiredFields(user)
    await user.type(screen.getByLabelText(/Prix de vente/), '24.90')
    await user.click(screen.getByRole('button', { name: 'Créer le produit' }))

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1))
    const payload = createProduct.mock.calls.at(-1)[0]
    expect(payload.soldByLength).toBe(false)
    expect(payload.lengthStepCm).toBeNull()
    expect(payload.lengthMinCm).toBeNull()
  })

  it('recharge les paramètres de découpe d\'une fiche existante', async () => {
    getProductById.mockResolvedValue({
      id: 620,
      name: 'Bande à broder lin',
      sku: 'SKU-620',
      price_chf: 26.00,
      compare_price_chf: null,
      sold_by_length: 1,
      length_step_cm: 5,
      length_min_cm: 25,
      stock: 4,
      category_id: 1,
      tax_rate_id: 1,
      images: [],
    })

    renderForm({ id: 620 })

    expect(await screen.findByLabelText(/Vendu à la coupe/)).toBeChecked()
    expect(screen.getByLabelText(/Vendu par tranches de/)).toHaveValue(5)
    expect(screen.getByLabelText(/Longueur minimale/)).toHaveValue(25)
  })

  /* Stock au mètre avec décimales (retour de Julie) : « format 999 999.99 ».
     La base compte des centimètres, le champ des mètres. */
  it('affiche le stock en mètres et le renvoie en centimètres', async () => {
    const user = userEvent.setup()
    getProductById.mockResolvedValue({
      id: 621, name: 'Bande Vaupel', sku: 'SKU-621', price_chf: 16.50, compare_price_chf: null,
      sold_by_length: 1, length_step_cm: 10, length_min_cm: 50, stock: 215,
      category_id: 1, tax_rate_id: 1, images: [],
    })
    updateProduct.mockResolvedValue({ id: 621 })
    renderForm({ id: 621 })

    const stock = await screen.findByLabelText(/Stock \(mètres\)/)
    await waitFor(() => expect(stock).toHaveValue(2.15))
    await user.clear(stock)
    await user.type(stock, '999999.99')
    await user.click(screen.getByRole('button', { name: /Enregistrer/i }))

    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    expect(updateProduct.mock.calls.at(-1)[1].stock).toBe(99999999)
  })

  it('refuse plus de deux décimales pour un stock au mètre', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillRequiredFields(user)
    await user.type(screen.getByLabelText(/Prix de vente/), '16.50')
    await user.click(screen.getByLabelText(/Vendu à la coupe/))
    const stock = screen.getByLabelText(/Stock \(mètres\)/)
    await user.clear(stock)
    await user.type(stock, '2.155')
    await user.click(screen.getByRole('button', { name: 'Créer le produit' }))

    expect(await screen.findByText('Deux décimales au maximum (ex. 2.15).')).toBeInTheDocument()
    expect(createProduct).not.toHaveBeenCalled()
  })

  it('garde un stock entier pour un article vendu à la pièce', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillRequiredFields(user)
    await user.type(screen.getByLabelText(/Prix de vente/), '24.90')
    const stock = screen.getByLabelText(/^Stock \*/)
    await user.clear(stock)
    await user.type(stock, '2.5')
    await user.click(screen.getByRole('button', { name: 'Créer le produit' }))

    expect(await screen.findByText('Nombre entier de pièces.')).toBeInTheDocument()
    expect(createProduct).not.toHaveBeenCalled()
  })
})

/* ADM-09 — « gestion basée uniquement sur la règle du stock minimum » : le
   minimum se saisit dans la fiche, à côté du stock, dans la même unité. */
describe('ProductForm — stock minimum (ADM-09)', () => {
  it('recharge le minimum d\'une bande en mètres et le renvoie en centimètres', async () => {
    const user = userEvent.setup()
    getProductById.mockResolvedValue({
      id: 622, name: 'Bande Zweigart', sku: 'SKU-622', price_chf: 18, compare_price_chf: null,
      sold_by_length: 1, length_step_cm: 10, length_min_cm: 50, stock: 120, stock_min: 500,
      category_id: 1, tax_rate_id: 1, images: [],
    })
    updateProduct.mockResolvedValue({ id: 622 })
    renderForm({ id: 622 })

    const min = await screen.findByLabelText('Stock minimum (mètres)')
    await waitFor(() => expect(min).toHaveValue(5))
    await user.clear(min)
    await user.type(min, '2.5')
    await user.click(screen.getByRole('button', { name: /Enregistrer/i }))

    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    const payload = updateProduct.mock.calls.at(-1)[1]
    expect(payload.stock).toBe(120)
    expect(payload.stockMin).toBe(250)
  })

  it('un minimum laissé vide part comme « non suivi » (null)', async () => {
    const user = userEvent.setup()
    getProductById.mockResolvedValue({
      id: 623, name: 'Fil DMC rouge', sku: 'SKU-623', price_chf: 1.5, compare_price_chf: null,
      stock: 10, stock_min: 10, category_id: 1, tax_rate_id: 1, images: [],
    })
    updateProduct.mockResolvedValue({ id: 623 })
    renderForm({ id: 623 })

    const min = await screen.findByLabelText('Stock minimum')
    await waitFor(() => expect(min).toHaveValue(10))
    await user.clear(min)
    await user.click(screen.getByRole('button', { name: /Enregistrer/i }))

    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1))
    expect(updateProduct.mock.calls.at(-1)[1].stockMin).toBeNull()
  })

  it('refuse un minimum décimal pour un article à la pièce', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillRequiredFields(user)
    await user.type(screen.getByLabelText(/Prix de vente/), '1.50')
    await user.type(screen.getByLabelText('Stock minimum'), '2.5')
    await user.click(screen.getByRole('button', { name: 'Créer le produit' }))

    expect(await screen.findAllByText('Nombre entier de pièces.')).toHaveLength(1)
    expect(createProduct).not.toHaveBeenCalled()
  })
})

/* ADM-04 — la fiche produit arrivait avant la liste des rayons et des
   fournisseurs : le <select> restait sur « — Choisir — » / « — Aucun — », et
   chaque catégorie enregistrée semblait perdue à la réouverture. */
describe('ProductForm — rayon et fournisseur affichés quand les listes arrivent après la fiche', () => {
  it('affiche le rayon principal et le fournisseur enregistrés', async () => {
    getProductById.mockResolvedValue({
      id: 12, name: 'Kit lent', sku: 'SKU-012', price_chf: 30, compare_price_chf: null,
      stock: 3, category_id: 2, supplier_id: 5, tax_rate_id: 1, images: [],
    })
    // Listes volontairement plus lentes que la fiche
    let releaseLists
    const listsReady = new Promise((resolve) => { releaseLists = resolve })
    getCategories.mockImplementation(() => listsReady.then(() => [
      { id: 1, parent_id: null, slug: 'kits', translations: { fr: { name: 'Kits' } } },
      { id: 2, parent_id: null, slug: 'toiles', translations: { fr: { name: 'Toiles' } } },
    ]))
    getSuppliers.mockImplementation(() => listsReady.then(() => ({ data: [{ id: 5, name: 'DMC sas' }] })))

    renderForm({ id: 12 })
    await screen.findByDisplayValue('Kit lent')
    releaseLists()

    await waitFor(() => {
      const category = screen.getByLabelText(/Catégorie principale/)
      expect(category.options[category.selectedIndex].text).toBe('Toiles')
    })
    const supplier = screen.getByLabelText(/Fournisseur/)
    expect(supplier.options[supplier.selectedIndex].text).toBe('DMC sas')
  })
})

/* Non-régression 25.09 : après avoir modifié puis enregistré une fiche,
   « Vos modifications ne sont pas enregistrées. Quitter cette page ? »
   s'affichait à chaque fois — le retour différé à la liste voyait l'état
   d'avant l'enregistrement. La garde doit rester active sans enregistrement. */
describe('ProductForm — quitter la fiche', () => {
  const PRODUCT = { id: 12, name: 'Kit fleurs', sku: 'SKU-012', price_chf: 30, stock: 5, category_id: 1, tax_rate_id: 1, images: [] }

  function renderWithList() {
    return render(
      <MemoryRouter initialEntries={['/produits/12']}>
        <Routes>
          <Route path="/produits" element={<p>Liste des produits</p>} />
          <Route path="/produits/:id" element={<ProductForm />} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('après un enregistrement réussi, retourne à la liste sans demander de confirmation', async () => {
    const user = userEvent.setup()
    getProductById.mockResolvedValue(PRODUCT)
    updateProduct.mockResolvedValue({ id: 12 })

    renderWithList()
    const name = await screen.findByLabelText(/Nom du produit/)
    await user.clear(name)
    await user.type(name, 'Kit fleurs des champs')
    await user.click(screen.getByRole('button', { name: /Enregistrer/i }))

    expect(await screen.findByText('Liste des produits', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.queryByText(/ne sont pas enregistrées/)).not.toBeInTheDocument()
    expect(updateProduct.mock.calls.at(-1)[1].translations.fr.name).toBe('Kit fleurs des champs')
  })

  it('sans enregistrement, quitter une fiche modifiée demande toujours confirmation', async () => {
    const user = userEvent.setup()
    getProductById.mockResolvedValue(PRODUCT)

    renderWithList()
    const name = await screen.findByLabelText(/Nom du produit/)
    await user.type(name, ' bis')
    await user.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(await screen.findByText(/Vos modifications ne sont pas enregistrées/)).toBeInTheDocument()
    expect(screen.queryByText('Liste des produits')).not.toBeInTheDocument()
    expect(updateProduct).not.toHaveBeenCalled()
  })
})
