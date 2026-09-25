import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
}))

import { getOrderById } from '../../services/orders.service.js'

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

const twintButton = () => screen.queryByRole('button', { name: /Envoyer un QR Twint par email/ })

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
