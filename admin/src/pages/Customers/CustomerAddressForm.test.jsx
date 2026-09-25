import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CustomerAddressForm from './CustomerAddressForm.jsx'

vi.mock('../../services/customers.service.js', () => ({
  createCustomerAddress: vi.fn(),
  updateCustomerAddress: vi.fn(),
}))

/* Répertoire officiel des NPA (API) simulé : quelques NPA suisses, le reste inconnu */
const LOCALITIES = {
  1003: [{ city: 'Lausanne', canton: 'VD' }],
  1509: [{ city: 'Vucherens', canton: 'VD' }],
  1510: [{ city: 'Moudon', canton: 'VD' }, { city: 'Syens', canton: 'VD' }],
}
vi.mock('../../services/localities.service.js', () => ({
  getLocalities: vi.fn(async (zip) => LOCALITIES[zip] ?? null),
  isSwissZip:    vi.fn(async (zip) => Boolean(LOCALITIES[zip])),
}))

import { createCustomerAddress, updateCustomerAddress } from '../../services/customers.service.js'

const HOME = {
  id: 1, label: 'Maison', address_type: 'both', first_name: null, last_name: null,
  street: 'Rue du Bourg', street_number: '12', zip: '1510', city: 'Moudon',
  canton: 'VD', country: 'CH', phone: null, is_default: 1,
}

const renderForm = (props = {}) => {
  const onSaved  = vi.fn()
  const onCancel = vi.fn()
  render(<CustomerAddressForm customerId={667} onSaved={onSaved} onCancel={onCancel} {...props} />)
  return { onSaved, onCancel }
}

const fillNewAddress = async (user) => {
  await user.type(screen.getByLabelText('Libellé'), 'Travail')
  await user.type(screen.getByLabelText('Rue'), 'Place de la Gare')
  await user.type(screen.getByLabelText('Numéro'), '1')
  await user.type(screen.getByLabelText('NPA'), '1003')
  // Localité préremplie depuis le NPA (liste officielle) : rien à taper
  await waitFor(() => expect(screen.getByLabelText('Localité')).toHaveValue('Lausanne'))
  await user.selectOptions(screen.getByLabelText('Canton'), 'VD')
}

beforeEach(() => { vi.clearAllMocks() })

/* CLI-06 — la boutique saisit et corrige les adresses de la cliente */
describe('CustomerAddressForm', () => {
  it('ajoute une adresse et peut la désigner par défaut', async () => {
    const user = userEvent.setup()
    const updated = { id: 667, addresses: [] }
    createCustomerAddress.mockResolvedValue(updated)
    const { onSaved } = renderForm()

    await fillNewAddress(user)
    await user.type(screen.getByLabelText(/Téléphone/), '079 123 45 67')
    await user.click(screen.getByLabelText(/Adresse par défaut/))
    await user.click(screen.getByRole('button', { name: 'Ajouter l\'adresse' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated))
    expect(createCustomerAddress).toHaveBeenCalledWith(667, {
      label: 'Travail', address_type: 'both', first_name: '', last_name: '', complement: '',
      street: 'Place de la Gare', street_number: '1', zip: '1003', city: 'Lausanne',
      canton: 'VD', phone: '079 123 45 67', is_default: true,
    })
  })

  it('refuse un NPA qui n\'a pas 4 chiffres, sans appel au serveur', async () => {
    const user = userEvent.setup()
    renderForm()

    await fillNewAddress(user)
    await user.clear(screen.getByLabelText('NPA'))
    await user.type(screen.getByLabelText('NPA'), '100')
    await user.click(screen.getByRole('button', { name: 'Ajouter l\'adresse' }))

    expect(await screen.findByText('NPA suisse invalide (4 chiffres, de 1000 à 9999).')).toBeInTheDocument()
    expect(createCustomerAddress).not.toHaveBeenCalled()
  })

  it('refuse un NPA commençant par 0 — aucun NPA suisse n\'existe sous 1000', async () => {
    const user = userEvent.setup()
    renderForm()

    await fillNewAddress(user)
    await user.clear(screen.getByLabelText('NPA'))
    await user.type(screen.getByLabelText('NPA'), '0999')
    await user.click(screen.getByRole('button', { name: 'Ajouter l\'adresse' }))

    expect(await screen.findByText('NPA suisse invalide (4 chiffres, de 1000 à 9999).')).toBeInTheDocument()
    expect(createCustomerAddress).not.toHaveBeenCalled()
  })

  it('refuse une rue plus longue que l\'étiquette La Poste (35 caractères)', async () => {
    const user = userEvent.setup()
    renderForm()

    await fillNewAddress(user)
    await user.clear(screen.getByLabelText('Rue'))
    await user.type(screen.getByLabelText('Rue'), 'R'.repeat(36))
    await user.click(screen.getByRole('button', { name: 'Ajouter l\'adresse' }))

    expect(await screen.findByText('35 caractères au maximum.')).toBeInTheDocument()
    expect(createCustomerAddress).not.toHaveBeenCalled()
  })

  it('refuse un NPA hors de Suisse (Liechtenstein) : livraison en Suisse uniquement', async () => {
    const user = userEvent.setup()
    renderForm()

    await fillNewAddress(user)
    await user.clear(screen.getByLabelText('NPA'))
    await user.type(screen.getByLabelText('NPA'), '9490')
    await user.click(screen.getByRole('button', { name: 'Ajouter l\'adresse' }))

    expect(await screen.findByText('Ce NPA ne correspond à aucune adresse de livraison en Suisse.')).toBeInTheDocument()
    expect(createCustomerAddress).not.toHaveBeenCalled()
  })

  it('NPA à une seule localité : localité et canton remplis d\'office', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('NPA'), '1509')

    await waitFor(() => expect(screen.getByLabelText('Localité')).toHaveValue('Vucherens'))
    expect(screen.getByLabelText('Canton')).toHaveValue('VD')
  })

  it('NPA à plusieurs localités : choix en un clic, sans remplir à l\'aveugle', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('NPA'), '1510')
    const choices = await screen.findByRole('group', { name: 'Localités de ce NPA' })
    expect(screen.getByLabelText('Localité')).toHaveValue('')

    await user.click(within(choices).getByRole('button', { name: 'Syens' }))
    expect(screen.getByLabelText('Localité')).toHaveValue('Syens')
    expect(within(choices).getByRole('button', { name: 'Syens' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('transmet le complément d\'adresse (c/o, bâtiment)', async () => {
    const user = userEvent.setup()
    createCustomerAddress.mockResolvedValue({ id: 667, addresses: [] })
    renderForm()

    await fillNewAddress(user)
    await user.type(screen.getByLabelText(/Complément/), 'c/o Famille Rochat')
    await user.click(screen.getByRole('button', { name: 'Ajouter l\'adresse' }))

    await waitFor(() => expect(createCustomerAddress).toHaveBeenCalledWith(667,
      expect.objectContaining({ complement: 'c/o Famille Rochat' })))
  })

  it('la première adresse est d\'office l\'adresse par défaut', () => {
    renderForm({ isFirst: true })

    const checkbox = screen.getByLabelText(/Adresse par défaut/)
    expect(checkbox).toBeChecked()
    expect(checkbox).toBeDisabled()
    expect(screen.getByText('La première adresse devient l\'adresse par défaut.')).toBeInTheDocument()
  })

  it('modifie une adresse par défaut sans toucher à ce statut', async () => {
    const user = userEvent.setup()
    updateCustomerAddress.mockResolvedValue({ id: 667 })
    renderForm({ address: HOME })

    expect(screen.getByLabelText('Rue')).toHaveValue('Rue du Bourg')
    expect(screen.getByLabelText(/Adresse par défaut/)).toBeDisabled()

    await user.clear(screen.getByLabelText('Numéro'))
    await user.type(screen.getByLabelText('Numéro'), '14')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateCustomerAddress).toHaveBeenCalled())
    const [customerId, addressId, payload] = updateCustomerAddress.mock.calls[0]
    expect([customerId, addressId]).toEqual([667, 1])
    expect(payload).toMatchObject({ street: 'Rue du Bourg', street_number: '14' })
    expect(payload).not.toHaveProperty('is_default')
  })

  it('affiche sous le champ une erreur renvoyée par le serveur', async () => {
    const user = userEvent.setup()
    updateCustomerAddress.mockRejectedValue({
      response: { status: 400, data: { success: false, message: 'Données invalides.', errors: [{ field: 'city', message: 'La localité est obligatoire.' }] } },
    })
    const { onSaved } = renderForm({ address: HOME })

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('La localité est obligatoire.')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })
})
