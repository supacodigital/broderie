import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import OrderDetail from './OrderDetail.jsx'

vi.mock('../../services/orders.service.js', () => ({
  getOrderById:    vi.fn(),
  downloadInvoice: vi.fn(),
}))

import { getOrderById, downloadInvoice } from '../../services/orders.service.js'

const PAID_TWINT = {
  id: 94,
  status: 'paid',
  payment_method: 'twint',
  paid_method: 'twint',
  paid_at: '2026-09-25T08:15:00.000Z',
  invoice_number: '2026-09/03',
  invoice_available: true,
  created_at: '2026-09-25T08:10:00.000Z',
  subtotal: '18.50', discount: '0.00', shipping_cost: '3.00', tax_amount: '1.61', total: '21.50',
  items: [{ id: 1, product_id: 7, quantity: 1, unit_price: '18.50', product_snapshot_json: { name: 'Kit Coquelicots', sku: 'KC-01' } }],
  history: [],
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/commandes/94']}>
      <Routes>
        <Route path="/commandes/:id" element={<OrderDetail />} />
      </Routes>
    </MemoryRouter>
  )

beforeEach(() => { vi.clearAllMocks() })

/* Retour du test Twint du 25.09 : la page commande n'offrait aucune facture */
describe('OrderDetail — facture d\'une commande payée', () => {
  it('propose la facture d\'une commande payée par Twint et la télécharge', async () => {
    const user = userEvent.setup()
    getOrderById.mockResolvedValue({ data: PAID_TWINT })
    downloadInvoice.mockResolvedValue()
    renderPage()

    // N° de commande = n° de facture
    expect(await screen.findByRole('heading', { name: 'Commande 2026-09/03' })).toBeInTheDocument()
    const invoiceCard = within(screen.getByRole('heading', { name: 'Facture' }).closest('section'))
    expect(invoiceCard.getByText('2026-09/03')).toBeInTheDocument()
    expect(invoiceCard.getByText('Payée le')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Télécharger le PDF' }))
    expect(downloadInvoice).toHaveBeenCalledWith(94)
  })

  it('signale un échec de téléchargement', async () => {
    const user = userEvent.setup()
    getOrderById.mockResolvedValue({ data: PAID_TWINT })
    downloadInvoice.mockRejectedValue(new Error('réseau'))
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Télécharger le PDF' }))
    expect(await screen.findByText('Impossible de télécharger la facture. Veuillez réessayer.')).toBeInTheDocument()
  })

  it('sans facture disponible (paiement non abouti, retrait à payer), aucun bouton', async () => {
    getOrderById.mockResolvedValue({ data: { ...PAID_TWINT, status: 'pending_pickup', payment_method: 'pickup', paid_at: null, invoice_available: false } })
    renderPage()

    expect(await screen.findByText('Articles commandés')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Télécharger/ })).not.toBeInTheDocument()
  })
})
