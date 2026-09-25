import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import OrderDetail from './OrderDetail.jsx'

vi.mock('../../services/orders.service.js', () => ({
  getOrderById:      vi.fn(),
  updateOrderStatus: vi.fn(),
  downloadInvoice:   vi.fn(),
  generateLabel:     vi.fn(),
  downloadLabel:     vi.fn(),
  updateTracking:    vi.fn(),
  sendTwintQr:       vi.fn(),
  getOrderPayment:   vi.fn().mockResolvedValue(null),
}))
vi.mock('../../contexts/ToastContext.jsx', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

import { getOrderById, updateOrderStatus } from '../../services/orders.service.js'

const ORDER = {
  id: 94, user_id: 7, status: 'pending_invoice', payment_method: 'invoice_qr',
  first_name: 'Marie', last_name: 'Dupont', email: 'marie@example.ch',
  created_at: '2026-09-25T09:00:00Z', invoice_number: '2026-09/15',
  subtotal: '24.00', discount: '0.00', shipping_cost: '3.00', tax_amount: '2.02', total: '27.00',
  shipping_first_name: 'Marie', shipping_last_name: 'Dupont', shipping_street: 'Rue du Test',
  shipping_street_number: '3', shipping_zip: '1004', shipping_city: 'Lausanne', shipping_canton: 'VD',
  shipping_country: 'CH',
  items: [{ id: 1, product_id: 506, name: 'Aïda 14 écru', sku: 'AIDA14', quantity: 1, unit_price: '24.00', tax_rate_snapshot: '8.10' }],
  history: [{ status: 'pending_invoice', note: 'Commande créée', created_at: '2026-09-25T09:00:00Z' }],
}

const renderOrder = async (order) => {
  getOrderById.mockResolvedValue(order)
  render(
    <MemoryRouter initialEntries={[`/commandes/${order.id}`]}>
      <Routes><Route path="/commandes/:id" element={<OrderDetail />} /></Routes>
    </MemoryRouter>
  )
  await screen.findAllByText(/Marie/)
}

const twintButton = () => screen.queryByRole('button', { name: /Envoyer un QR Twint par e-mail/ })

beforeEach(() => vi.clearAllMocks())

describe('OrderDetail — QR Twint par e-mail', () => {
  it('proposé pour une facture à payer', async () => {
    await renderOrder(ORDER)
    expect(twintButton()).toBeInTheDocument()
  })

  /* Audit du 25.09 : le bouton s'affichait pour une commande « retrait +
     paiement en boutique », et chaque clic se soldait par « Cette commande ne
     peut pas être payée » (le serveur refuse ce statut). */
  it('absent pour une commande à retirer et payer en boutique', async () => {
    await renderOrder({ ...ORDER, status: 'pending_pickup', payment_method: 'pickup', shipping_street: null })
    expect(twintButton()).not.toBeInTheDocument()
  })
})

/* Refonte du 25.09 : la carte « Traitement » dit où en est la commande et ne
   propose que les actions de l'étape en cours. */
describe('OrderDetail — Traitement', () => {
  const traitement = () => within(screen.getByRole('region', { name: 'Traitement' }))

  it('facture à payer : étape, frise et actions de paiement', async () => {
    await renderOrder(ORDER)
    const card = traitement()
    expect(card.getByText('En attente du paiement de la facture')).toBeInTheDocument()
    expect(card.getByRole('button', { name: /Marquer comme payée/ })).toBeInTheDocument()
    expect(card.getByText('Payée').closest('li')).toHaveAttribute('data-state', 'current')
    expect(card.queryByRole('button', { name: /Marquer comme expédiée/ })).not.toBeInTheDocument()
  })

  it('payée : expédition proposée, avec confirmation avant tout e-mail ou étiquette', async () => {
    const user = userEvent.setup()
    await renderOrder({ ...ORDER, status: 'paid', paid_at: '2026-09-25T10:00:00Z', payment_method: 'twint' })
    const card = traitement()
    expect(card.getByText('À préparer et expédier')).toBeInTheDocument()
    expect(card.getByLabelText('Mode d’envoi')).toHaveValue('ECO')

    await user.click(card.getByRole('button', { name: /Marquer comme expédiée/ }))
    expect(screen.getByText(/une étiquette PostPac Economy sera générée/)).toBeInTheDocument()
    expect(updateOrderStatus).not.toHaveBeenCalled()
  })

  it('facture expédiée avant paiement : l\'étape « Payée » reste en attente', async () => {
    await renderOrder({ ...ORDER, status: 'shipped', tracking_number: '99.00.1' })
    const card = traitement()
    expect(card.getByText('Payée').closest('li')).toHaveAttribute('data-state', 'waiting')
    expect(card.getByText('Expédiée', { selector: 'p' })).toBeInTheDocument()
    expect(card.getByRole('button', { name: /Marquer comme livrée/ })).toBeInTheDocument()
  })

  it('retrait à préparer : parcours retrait, sans expédition', async () => {
    await renderOrder({ ...ORDER, status: 'pending_pickup', payment_method: 'pickup', shipping_street: null })
    const card = traitement()
    expect(card.getByText('Retrait en boutique')).toBeInTheDocument()
    expect(card.getByRole('button', { name: /Marquer prête pour le retrait/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Expédition' })).not.toBeInTheDocument()
  })

  it('facture papier demandée : rappel tant que le colis n\'est pas parti', async () => {
    await renderOrder({ ...ORDER, wants_printed_invoice: 1 })
    expect(traitement().getByText('Facture imprimée demandée')).toBeInTheDocument()
  })
})
