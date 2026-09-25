import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PaymentDetails from './PaymentDetails.jsx'

vi.mock('../../services/orders.service.js', () => ({
  getOrderPayment: vi.fn(),
}))
vi.mock('../../contexts/ToastContext.jsx', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

import { getOrderPayment } from '../../services/orders.service.js'

const TWINT_PAID = {
  status: 'paid', method: 'twint', chosen_method: 'twint', paid_at: '2026-09-25T14:05:35.000Z', total: 11.5,
  invoice: null, stripe_unavailable: false,
  stripe: {
    intent_id: 'pi_3UJZkQ', charge_id: 'py_3UJZkQ', status: 'succeeded', livemode: false,
    amount: 11.5, amount_received: 11.5, amount_refunded: 0, currency: 'CHF',
    paid_at: '2026-09-25T14:05:34.000Z', method: 'twint', card: null,
    risk_level: 'normal', network_status: 'approved_by_network',
    fee: 0.52, net: 10.98, available_on: '2026-10-02T00:00:00.000Z',
    receipt_url: 'https://pay.stripe.com/receipts/payment/abc',
    dashboard_url: 'https://dashboard.stripe.com/test/payments/pi_3UJZkQ',
    last_error: null,
  },
  attempts: [{ id: 110, method: 'twint', status: 'succeeded', amount: 11.5, created_at: '2026-09-25T14:05:10.000Z', reference: 'pi_3UJZkQ', via_email: false }],
}

const CARD_REFUSED = {
  status: 'failed', method: 'card', chosen_method: 'card', paid_at: null, total: 42,
  invoice: null, stripe_unavailable: false,
  stripe: {
    ...TWINT_PAID.stripe, intent_id: 'pi_card', charge_id: null, status: 'requires_payment_method', livemode: true,
    amount_received: 0, paid_at: null, method: 'card', fee: null, net: null, available_on: null, receipt_url: null,
    card: { brand: 'Visa', last4: '4242', exp_month: 4, exp_year: 2028, country: 'CH', wallet: null, three_d_secure: null },
    last_error: { code: 'insufficient_funds', reason: 'fonds insuffisants' },
  },
  attempts: [
    { id: 1, method: 'card', status: 'failed', amount: 42, created_at: '2026-09-25T10:00:00.000Z', reference: 'pi_old', via_email: false },
    { id: 2, method: 'card', status: 'failed', amount: 42, created_at: '2026-09-25T10:03:00.000Z', reference: 'pi_card', via_email: false },
  ],
}

const INVOICE_PENDING = {
  status: 'pending', method: 'invoice_qr', chosen_method: 'invoice_qr', paid_at: null, total: 27,
  invoice: { number: '2026-09/15', qr_reference: '000000000000020260900000584' },
  stripe: null, stripe_unavailable: false, attempts: [],
}

const renderCard = () => render(<PaymentDetails orderId={102} reloadKey="paid" />)
const fact = (label) => screen.getByText(label).closest('div')

beforeEach(() => { vi.clearAllMocks() })

describe('PaymentDetails — transaction de la cliente', () => {
  it('Twint payé : encaissement, frais, antifraude et références Stripe', async () => {
    getOrderPayment.mockResolvedValue(TWINT_PAID)
    renderCard()

    expect(await screen.findByText('Payée')).toBeInTheDocument()
    expect(screen.getByText('Paiement de test')).toBeInTheDocument()
    expect(within(fact('Moyen de paiement')).getByText('Twint')).toBeInTheDocument()
    expect(within(fact('Montant encaissé')).getByText(/11[.,]50/)).toBeInTheDocument()
    expect(within(fact('Payée le')).getByText('25.09.2026 à 16:05')).toBeInTheDocument()
    expect(within(fact('Frais Stripe')).getByText(/0[.,]52/)).toBeInTheDocument()
    expect(within(fact('Frais Stripe')).getByText(/Net reçu : CHF\s10[.,]98/)).toBeInTheDocument()
    expect(within(fact('Contrôle antifraude')).getByText('Risque normal · approuvé par le réseau')).toBeInTheDocument()
    expect(screen.getByText('pi_3UJZkQ')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Voir dans Stripe/ })).toHaveAttribute('href', TWINT_PAID.stripe.dashboard_url)
    expect(screen.getByRole('link', { name: /Reçu Stripe/ })).toHaveAttribute('href', TWINT_PAID.stripe.receipt_url)
    // Une seule tentative réussie : pas de liste redondante
    expect(screen.queryByText('Tentatives de paiement')).not.toBeInTheDocument()
    expect(getOrderPayment).toHaveBeenCalledWith(102)
  })

  it('carte refusée : carte utilisée, motif en français et historique des tentatives', async () => {
    getOrderPayment.mockResolvedValue(CARD_REFUSED)
    renderCard()

    expect(await screen.findByText('Paiement refusé')).toBeInTheDocument()
    expect(screen.queryByText('Paiement de test')).not.toBeInTheDocument()
    expect(within(fact('Moyen de paiement')).getByText('Visa •••• 4242')).toBeInTheDocument()
    expect(within(fact('Moyen de paiement')).getByText('exp. 04/28 · CH')).toBeInTheDocument()
    expect(within(fact('Montant dû')).getByText(/42[.,]00/)).toBeInTheDocument()
    expect(within(fact('Motif du refus')).getByText('fonds insuffisants')).toBeInTheDocument()
    expect(screen.getByText('Tentatives de paiement')).toBeInTheDocument()
    expect(screen.getAllByText('Refusé')).toHaveLength(2)
  })

  it('facture QR à payer : n° de facture et référence QR groupée comme sur le bulletin', async () => {
    getOrderPayment.mockResolvedValue(INVOICE_PENDING)
    renderCard()

    expect(await screen.findByText('En attente de paiement')).toBeInTheDocument()
    expect(within(fact('Moyen de paiement')).getByText('Facture QR')).toBeInTheDocument()
    expect(within(fact('N° de facture')).getByText('2026-09/15')).toBeInTheDocument()
    expect(within(fact('Référence QR')).getByText('00 00000 00000 02026 09000 00584')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Voir dans Stripe/ })).not.toBeInTheDocument()
  })

  it('Stripe injoignable : le signale et affiche les informations de la boutique', async () => {
    getOrderPayment.mockResolvedValue({ ...TWINT_PAID, stripe: null, stripe_unavailable: true })
    renderCard()

    expect(await screen.findByText(/Détails Stripe momentanément indisponibles/)).toBeInTheDocument()
    expect(within(fact('Moyen de paiement')).getByText('Twint')).toBeInTheDocument()
  })

  it('erreur de chargement : message et nouvel essai', async () => {
    const user = userEvent.setup()
    getOrderPayment.mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce(TWINT_PAID)
    renderCard()

    expect(await screen.findByText('Impossible de charger le détail du paiement.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('Payée')).toBeInTheDocument()
  })
})
