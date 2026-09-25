import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CustomerIdentityForm from './CustomerIdentityForm.jsx'

vi.mock('../../services/customers.service.js', () => ({
  updateCustomer: vi.fn(),
}))

import { updateCustomer } from '../../services/customers.service.js'

const CUSTOMER = { id: 667, first_name: 'Claire', last_name: 'Dupont', email: 'claire@example.ch' }

const renderForm = (props = {}) => {
  const onSaved  = vi.fn()
  const onCancel = vi.fn()
  render(<CustomerIdentityForm customer={CUSTOMER} onSaved={onSaved} onCancel={onCancel} {...props} />)
  return { onSaved, onCancel }
}

beforeEach(() => { vi.clearAllMocks() })

/* CLI-06 — la boutique modifie prénom, nom et adresse e-mail d'une cliente */
describe('CustomerIdentityForm', () => {
  it('pré-remplit la fiche et enregistre la nouvelle adresse e-mail', async () => {
    const user = userEvent.setup()
    const updated = { ...CUSTOMER, email: 'claire.dupont@example.ch' }
    updateCustomer.mockResolvedValue(updated)
    const { onSaved } = renderForm()

    expect(screen.getByLabelText('Prénom')).toHaveValue('Claire')
    expect(screen.getByLabelText('Nom')).toHaveValue('Dupont')

    const email = screen.getByLabelText('E-mail')
    await user.clear(email)
    await user.type(email, 'claire.dupont@example.ch')
    expect(screen.getByText('La cliente devra se connecter avec cette nouvelle adresse.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated))
    expect(updateCustomer).toHaveBeenCalledWith(667, {
      first_name: 'Claire', last_name: 'Dupont', email: 'claire.dupont@example.ch',
    })
  })

  it('signale une adresse invalide sous le champ, sans appel au serveur', async () => {
    const user = userEvent.setup()
    renderForm()

    const email = screen.getByLabelText('E-mail')
    await user.clear(email)
    await user.type(email, 'claire@')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Adresse e-mail invalide.')).toBeInTheDocument()
    expect(updateCustomer).not.toHaveBeenCalled()
  })

  it('affiche sous le champ e-mail le refus d\'une adresse déjà utilisée', async () => {
    const user = userEvent.setup()
    updateCustomer.mockRejectedValue({
      response: { status: 409, data: { success: false, message: 'Cette adresse e-mail est déjà utilisée par un autre compte.' } },
    })
    const { onSaved } = renderForm()

    const email = screen.getByLabelText('E-mail')
    await user.clear(email)
    await user.type(email, 'autre@example.ch')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Cette adresse e-mail est déjà utilisée par un autre compte.')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('Échap et « Annuler » abandonnent la modification', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderForm()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(updateCustomer).not.toHaveBeenCalled()
  })
})
