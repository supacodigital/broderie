import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Checkout from './Checkout.jsx'

/* CLI-15 — « Après paiement, message d'erreur : Impossible de générer le
   paiement TWINT ». Au retour de l'app Twint (ou de 3-D Secure), la page de
   paiement redemandait un paiement pour une commande déjà réglée. Elle doit
   désormais vérifier l'état du paiement et afficher la confirmation. */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: 'fr' } }),
}))

const clearCartMock = vi.fn()
const reloadCartMock = vi.fn()
let cartItems = []
vi.mock('../../contexts/CartContext.jsx', () => ({
  useCart: () => ({
    items: cartItems, subtotal: cartItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0),
    clearCart: clearCartMock, reloadCart: reloadCartMock,
  }),
}))

let authValue = { user: null, isAuthenticated: false }
vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => authValue,
}))

// Stripe n'est pas chargé en test : le formulaire de paiement n'est pas rendu
vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn(() => null) }))
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }) => children,
  PaymentElement: () => null,
  useStripe: () => null,
  useElements: () => null,
}))

const syncPaymentMock = vi.fn()
const createTwintIntentMock = vi.fn()
vi.mock('../../services/payments.service.js', () => ({
  syncPayment: (...args) => syncPaymentMock(...args),
  createTwintIntent: (...args) => createTwintIntentMock(...args),
  createCardIntent: vi.fn(),
}))
const createOrderMock = vi.fn()
vi.mock('../../services/orders.service.js', () => ({
  abandonOrderPayment: vi.fn(),
  createOrder: (...args) => createOrderMock(...args),
}))
vi.mock('../../services/coupons.service.js', () => ({ validateCoupon: vi.fn() }))
let savedAddresses = []
vi.mock('../../services/addresses.service.js', () => ({ getAddresses: vi.fn(() => Promise.resolve({ data: savedAddresses })) }))
vi.mock('../../services/shipping.service.js', () => ({
  getShippingRate: vi.fn(() => Promise.resolve({ price_chf: 8.5, carrier: 'Swiss Post', estimated_days: '3-5' })),
}))

// Étape de paiement Twint en cours, telle que le checkout la mémorise
function resumeTwintStep(orderId = '68') {
  sessionStorage.setItem('checkout_step', 'twint')
  sessionStorage.setItem('checkout_order_id', orderId)
  sessionStorage.setItem('checkout_order_total', '18.50')
}

// Adresse de retour construite par Stripe après la redirection
function returnFromStripe(query) {
  window.history.replaceState({}, '', `/commande?${query}`)
}

function renderCheckout() {
  return render(
    <MemoryRouter initialEntries={['/commande']}>
      <Checkout />
    </MemoryRouter>
  )
}

beforeEach(() => {
  sessionStorage.clear()
  cartItems = []
  savedAddresses = []
  authValue = { user: null, isAuthenticated: false }
  clearCartMock.mockReset()
  reloadCartMock.mockReset()
  createOrderMock.mockReset()
  syncPaymentMock.mockReset()
  createTwintIntentMock.mockReset().mockResolvedValue({ clientSecret: 'cs_test' })
  window.scrollTo = vi.fn()
})

afterEach(() => {
  window.history.replaceState({}, '', '/')
})

describe('Checkout — retour de l\'app Twint (CLI-15)', () => {
  test('paiement accepté : confirmation affichée, aucun nouveau paiement demandé', async () => {
    resumeTwintStep()
    returnFromStripe('order=68&payment_intent=pi_1&payment_intent_client_secret=pi_1_secret&redirect_status=succeeded')
    syncPaymentMock.mockResolvedValue({ orderStatus: 'paid', intentStatus: 'succeeded', paymentMethod: 'twint', total: '18.50' })

    renderCheckout()

    expect(await screen.findByText('checkout.confirmTitle')).toBeInTheDocument()
    expect(syncPaymentMock).toHaveBeenCalledWith('68')
    expect(createTwintIntentMock).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('checkout_order_id')).toBeNull()
  })

  /* L'app Twint peut rouvrir le site dans un nouvel onglet : sessionStorage y
     est vide, seul le numéro de commande de l'URL permet de s'y retrouver. */
  test('retour dans un nouvel onglet, sans état mémorisé : confirmation quand même', async () => {
    returnFromStripe('order=71&payment_intent=pi_2&redirect_status=succeeded')
    syncPaymentMock.mockResolvedValue({ orderStatus: 'paid', intentStatus: 'succeeded', paymentMethod: 'twint', total: '18.50' })

    renderCheckout()

    expect(await screen.findByText('checkout.confirmTitle')).toBeInTheDocument()
    expect(syncPaymentMock).toHaveBeenCalledWith('71')
  })

  test('paiement encore en validation chez Twint : confirmation avec la mention adaptée', async () => {
    resumeTwintStep()
    returnFromStripe('order=68&payment_intent=pi_1&redirect_status=succeeded')
    syncPaymentMock.mockResolvedValue({ orderStatus: 'awaiting_payment', intentStatus: 'processing', paymentMethod: 'twint', total: '18.50' })

    renderCheckout()

    expect(await screen.findByText('checkout.confirmProcessing')).toBeInTheDocument()
    expect(createTwintIntentMock).not.toHaveBeenCalled()
  })

  test('paiement refusé : message clair et nouvelle tentative possible', async () => {
    resumeTwintStep()
    returnFromStripe('order=68&payment_intent=pi_1&redirect_status=failed')
    syncPaymentMock.mockResolvedValue({ orderStatus: 'payment_failed', intentStatus: 'requires_payment_method', paymentMethod: 'twint', total: '18.50' })

    renderCheckout()

    expect(await screen.findByText('checkout.paymentNotCompleted')).toBeInTheDocument()
    // Le formulaire Twint est reproposé (même paiement Stripe, réutilisé côté serveur)
    await waitFor(() => expect(createTwintIntentMock).toHaveBeenCalledWith('68'))
    expect(screen.queryByText('checkout.confirmTitle')).not.toBeInTheDocument()
  })

  /* Le webhook a déjà validé la commande quand la cliente recharge la page de
     paiement : c'est ce cas qui affichait « Impossible de générer le paiement
     Twint ». */
  test('page de paiement rechargée après un paiement réussi : confirmation', async () => {
    resumeTwintStep()
    syncPaymentMock.mockResolvedValue({ orderStatus: 'paid', intentStatus: 'succeeded', paymentMethod: 'twint', total: '18.50' })

    renderCheckout()

    expect(await screen.findByText('checkout.confirmTitle')).toBeInTheDocument()
    expect(screen.queryByText('checkout.errors.twintInit')).not.toBeInTheDocument()
    expect(createTwintIntentMock).not.toHaveBeenCalled()
  })

  test('vérification impossible : message et bouton pour vérifier à nouveau', async () => {
    resumeTwintStep()
    returnFromStripe('order=68&payment_intent=pi_1&redirect_status=succeeded')
    syncPaymentMock
      .mockRejectedValueOnce({ response: { status: 503, data: { message: 'Impossible de vérifier le paiement pour le moment.' } } })
      .mockResolvedValueOnce({ orderStatus: 'paid', intentStatus: 'succeeded', paymentMethod: 'twint', total: '18.50' })

    renderCheckout()

    expect(await screen.findByText('Impossible de vérifier le paiement pour le moment.')).toBeInTheDocument()
    // Surtout pas de nouveau formulaire de paiement tant que l'issue est inconnue
    expect(createTwintIntentMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /checkout.checkAgain/ }))

    expect(await screen.findByText('checkout.confirmTitle')).toBeInTheDocument()
    expect(syncPaymentMock).toHaveBeenCalledTimes(2)
  })
})

/* CLI-13 — « le retour vers la boutique vide complètement le panier ». Pour la
   carte et Twint, le panier était vidé dès la création de la commande, avant
   le paiement. */
describe('Checkout — le panier est conservé pendant le paiement (CLI-13)', () => {
  // Cliente connectée avec une adresse enregistrée et un article au panier
  function readyToOrder() {
    cartItems = [{ id: 1, product_id: 10, product_name: 'Coton mouliné', quantity: 2, unit_price: 3.9 }]
    authValue = { user: { id: 7, first_name: 'Julie', last_name: 'Test' }, isAuthenticated: true }
    savedAddresses = [{
      id: 3, label: 'Maison', street: 'Chemin du Collège', street_number: '6',
      zip: '1509', city: 'Vucherens', canton: 'VD', is_default: 1,
    }]
  }

  async function placeOrderWith(method) {
    renderCheckout()
    // Adresse préremplie depuis le compte, puis étape 2
    await waitFor(() => expect(screen.getByDisplayValue('Vucherens')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /checkout.continueToSummary/ }))
    const radio = await screen.findByRole('radio', { name: method })
    fireEvent.click(radio)
    fireEvent.click(screen.getByLabelText(/checkout.cgvAccept/))
    await waitFor(() => expect(screen.getByRole('button', { name: /checkout.placeOrder/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /checkout.placeOrder/ }))
  }

  test('carte : le panier n\'est pas vidé à la création de la commande', async () => {
    readyToOrder()
    createOrderMock.mockResolvedValue({ data: { id: 80, total: 16.3 } })
    createTwintIntentMock.mockResolvedValue({ clientSecret: 'cs' })

    await placeOrderWith(/checkout.paymentCard/)

    await waitFor(() => expect(createOrderMock).toHaveBeenCalledWith(expect.objectContaining({ payment_method: 'card' })))
    await waitFor(() => expect(sessionStorage.getItem('checkout_step')).toBe('card'))
    expect(clearCartMock).not.toHaveBeenCalled()
  })

  test('facture : la commande est définitive, le panier est vidé', async () => {
    readyToOrder()
    createOrderMock.mockResolvedValue({ data: { id: 81, total: 16.3 } })

    await placeOrderWith(/checkout.paymentInvoice/)

    expect(await screen.findByText('checkout.confirmTitle')).toBeInTheDocument()
    expect(clearCartMock).toHaveBeenCalledTimes(1)
  })

  /* La cliente quitte l'étape de paiement pour la boutique : au prochain
     passage par la caisse, elle repart de son panier au lieu de retomber sur
     le paiement de l'ancienne commande. */
  test('quitter l\'étape de paiement : elle n\'est pas reprise au prochain passage', async () => {
    resumeTwintStep('90')
    syncPaymentMock.mockResolvedValue({ orderStatus: 'awaiting_payment', intentStatus: 'requires_payment_method', paymentMethod: 'twint', total: '18.50' })
    const { unmount } = renderCheckout()
    await screen.findByText('checkout.twintTitle')

    unmount()

    await waitFor(() => expect(sessionStorage.getItem('checkout_step')).toBeNull())
    expect(sessionStorage.getItem('checkout_order_id')).toBeNull()
  })

  test('paiement confirmé au retour de Twint : le panier est rechargé (articles payés retirés)', async () => {
    resumeTwintStep()
    returnFromStripe('order=68&payment_intent=pi_1&redirect_status=succeeded')
    syncPaymentMock.mockResolvedValue({ orderStatus: 'paid', intentStatus: 'succeeded', paymentMethod: 'twint', total: '18.50' })

    renderCheckout()

    expect(await screen.findByText('checkout.confirmTitle')).toBeInTheDocument()
    expect(reloadCartMock).toHaveBeenCalled()
  })
})

/* CLI-14 — le récapitulatif de la caisse montre les articles en action, comme
   le panier. */
describe('Checkout — articles en action dans le récapitulatif (CLI-14)', () => {
  test('mention « En action » et total normal barré pour la ligne en action', async () => {
    cartItems = [
      { id: 1, product_id: 232, product_name: 'DMC mouliné N° 3045', quantity: 3, unit_price: 1.5, compare_unit_price: 2 },
      { id: 2, product_id: 1493, product_name: 'Graziano, tissu', quantity: 1, unit_price: 10, compare_unit_price: null },
    ]
    authValue = { user: { id: 7, first_name: 'Julie', last_name: 'Test' }, isAuthenticated: true }

    renderCheckout()

    expect(await screen.findAllByText('cart.onSale')).toHaveLength(1)
    const old = screen.getByText('CHF 6.00')
    expect(old.className).toMatch(/summaryItemPriceOld/)
  })
})

