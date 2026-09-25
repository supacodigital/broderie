import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CustomerDetail from './CustomerDetail.jsx'
import { formatCHF } from '../../utils/chf.js'

// formatCHF sépare « CHF » du montant par une espace insécable, que Testing
// Library ramène à une espace simple dans le texte affiché
const chf = (amount) => formatCHF(amount).replace(/\s+/g, ' ')

vi.mock('../../services/customers.service.js', () => ({
  getCustomerById:       vi.fn(),
  updateCustomer:        vi.fn(),
  createCustomerAddress: vi.fn(),
  updateCustomerAddress: vi.fn(),
  deleteCustomerAddress: vi.fn(),
}))
vi.mock('../../contexts/ToastContext.jsx', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

import { getCustomerById, deleteCustomerAddress } from '../../services/customers.service.js'

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

const CUSTOMER = {
  id: 667,
  first_name: 'Claire',
  last_name: 'Dupont',
  email: 'claire@example.ch',
  is_active: 1,
  email_verified_at: '2026-09-01T10:00:00.000Z',
  created_at: '2026-01-15T10:00:00.000Z',
  newsletter_status: 'subscribed',
  addresses: [
    { id: 2, label: 'Travail', address_type: 'shipping', first_name: null, last_name: null,
      street: 'Place de la Gare', street_number: '1', zip: '1003', city: 'Lausanne', canton: 'VD',
      country: 'CH', phone: '+41 21 000 00 00', is_default: 0 },
    { id: 1, label: 'Maison', address_type: 'both', first_name: 'Claire', last_name: 'Dupont',
      street: 'Rue du Bourg', street_number: '12', zip: '1510', city: 'Moudon', canton: 'VD',
      country: 'CH', phone: '079 123 45 67', is_default: 1 },
  ],
  orders: [
    { id: 81, invoice_number: '2026-09/02', status: 'pending_invoice', total: '40.00', created_at: daysAgo(3) },
    { id: 64, invoice_number: '2026-000012', status: 'cancelled',      total: '99.00', created_at: daysAgo(40) },
    { id: 52, invoice_number: '2026-000009', status: 'delivered',      total: '20.00', created_at: daysAgo(60) },
  ],
  loyalty: {
    total_spend_chf: 60, tier_name: null,
    next_tier: { name: 'Argent', min_spend_chf: 200 },
    rewards: [],
  },
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/clients/667']}>
      <Routes>
        <Route path="/clients/:id" element={<CustomerDetail />} />
      </Routes>
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  getCustomerById.mockResolvedValue(CUSTOMER)
})

describe('CustomerDetail — fiche client', () => {
  it('résume l\'activité : annulations exclues du total et du panier moyen', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Claire Dupont' })).toBeInTheDocument()
    expect(screen.getByText('C000667')).toBeInTheDocument()

    const kpis = (label) => screen.getByText(label, { selector: 'dt' }).closest('div')
    expect(within(kpis('Commandes')).getByText('3')).toBeInTheDocument()
    expect(within(kpis('Commandes')).getByText('dont 1 annulée ou remboursée')).toBeInTheDocument()
    expect(within(kpis('Total commandé')).getByText(chf(60))).toBeInTheDocument()
    expect(within(kpis('Panier moyen')).getByText(chf(30))).toBeInTheDocument()
    expect(within(kpis('Dernière commande')).getByText('il y a 3 jours')).toBeInTheDocument()
  })

  it('chaque commande ouvre sa fiche, désignée par son n° de facture', async () => {
    renderPage()

    // N° de commande = n° de facture
    const row = await screen.findByRole('link', { name: /2026-09\/02/ })
    expect(row).toHaveAttribute('href', '/commandes/81')
    expect(within(row).getByText('Facture à payer')).toBeInTheDocument()
  })

  it('affiche les coordonnées utiles : téléphone de l\'adresse par défaut, newsletter, adresses postales', async () => {
    renderPage()

    const contact = within(await screen.findByRole('region', { name: 'Coordonnées' }))
    expect(contact.getByRole('link', { name: 'claire@example.ch' })).toHaveAttribute('href', 'mailto:claire@example.ch')
    expect(contact.getByText('Adresse vérifiée')).toBeInTheDocument()
    expect(contact.getByRole('link', { name: '079 123 45 67' })).toHaveAttribute('href', 'tel:0791234567')
    expect(contact.getByText('Oui')).toBeInTheDocument()

    expect(screen.getByText('Rue du Bourg 12')).toBeInTheDocument()
    // Format La Poste : « NPA Localité », sans canton
    expect(screen.getByText('1510 Moudon')).toBeInTheDocument()
    expect(screen.getByText('Par défaut')).toBeInTheDocument()
    expect(screen.getByText('Livraison')).toBeInTheDocument()
  })

  it('signale une adresse e-mail non vérifiée et ce qu\'elle bloque', async () => {
    getCustomerById.mockResolvedValue({ ...CUSTOMER, email_verified_at: null })
    renderPage()

    expect(await screen.findByText('Adresse non vérifiée')).toBeInTheDocument()
    expect(screen.getByText(/avant de pouvoir commander/)).toBeInTheDocument()
  })

  it('montre ce qu\'il manque pour le prochain palier de fidélité', async () => {
    renderPage()

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '30')
    expect(screen.getByText(chf(140))).toBeInTheDocument()
  })

  it('signale un compte désactivé', async () => {
    getCustomerById.mockResolvedValue({ ...CUSTOMER, is_active: 0 })
    renderPage()

    expect(await screen.findByText('Compte désactivé')).toBeInTheDocument()
  })

  it('« Modifier » ouvre le formulaire des coordonnées, « Annuler » le referme', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Modifier' }))
    expect(screen.getByLabelText('E-mail')).toHaveValue('claire@example.ch')

    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument()
  })

  it('« Ajouter » ouvre le formulaire d\'une nouvelle adresse', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Ajouter' }))
    expect(screen.getByRole('form', { name: 'Nouvelle adresse' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Adresse par défaut/)).not.toBeChecked()
  })

  it('une fiche sans adresse propose d\'en ajouter une, d\'office par défaut', async () => {
    const user = userEvent.setup()
    getCustomerById.mockResolvedValue({ ...CUSTOMER, addresses: [] })
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Ajouter une adresse' }))
    expect(screen.getByLabelText(/Adresse par défaut/)).toBeChecked()
  })

  it('le crayon d\'une adresse ouvre sa modification', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Modifier l\'adresse Maison' }))
    expect(screen.getByRole('form', { name: 'Modifier l\'adresse Maison' })).toBeInTheDocument()
    expect(screen.getByLabelText('Rue')).toHaveValue('Rue du Bourg')
  })

  it('supprime une adresse après confirmation, puis recharge la fiche', async () => {
    const user = userEvent.setup()
    deleteCustomerAddress.mockResolvedValue()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Supprimer l\'adresse Travail' }))
    expect(screen.getByText(/Supprimer l'adresse « Travail » \?/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmer' }))

    expect(deleteCustomerAddress).toHaveBeenCalledWith(667, 2)
    expect(getCustomerById).toHaveBeenCalledTimes(2)
  })

  it('indique un client introuvable', async () => {
    getCustomerById.mockRejectedValue({ response: { status: 404 } })
    renderPage()

    expect(await screen.findByText('Client introuvable')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retour à la liste des clients' })).toHaveAttribute('href', '/clients')
  })
})
