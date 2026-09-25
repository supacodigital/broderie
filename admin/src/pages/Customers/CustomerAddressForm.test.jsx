import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CustomerAddressForm from './CustomerAddressForm.jsx'

vi.mock('../../services/customers.service.js', () => ({
  createCustomerAddress: vi.fn(),
  updateCustomerAddress: vi.fn(),
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
  await user.type(screen.getByLabelText('Localité'), 'Lausanne')
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
      label: 'Travail', address_type: 'both', first_name: '', last_name: '',
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

    expect(await screen.findByText('NPA suisse sur 4 chiffres.')).toBeInTheDocument()
    expect(createCustomerAddress).not.toHaveBeenCalled()
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
