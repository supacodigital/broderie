import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/* Répétition de la création du super-administrateur (ADM-08, 25.09) : c'est par
   cette page qu'il choisit son premier mot de passe. Un mot de passe trop court
   pour un compte administrateur (12 caractères) s'affichait « Ce lien est
   invalide ou a expiré » — alors que le lien restait valable.
   Service remplacé par une fonction ordinaire (voir NewsletterConfirm.test.jsx :
   Vitest 4 signale le rejet d'un vi.fn() même intercepté). */
let calls = []
let resetImpl = async () => ({})
vi.mock('../../services/auth.service.js', () => ({
  resetPassword: (...args) => { calls.push(args); return resetImpl(...args) },
}))

import ResetPassword from './ResetPassword.jsx'

const httpError = (status, data) => {
  const err = new Error(String(status))
  err.response = { status, data }
  return err
}

const renderPage = () => render(
  <MemoryRouter initialEntries={['/reinitialiser-mot-de-passe?token=abc123']}>
    <ResetPassword />
  </MemoryRouter>
)

const submit = (password) => {
  fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le mot de passe' }))
}

const ADMIN_RULE = 'Le mot de passe doit contenir au moins 12 caractères, dont une majuscule.'

describe('ResetPassword', () => {
  beforeEach(() => { calls = [] })

  test('la consigne mentionne la règle des comptes administrateur', () => {
    renderPage()
    expect(screen.getByText(/Compte administrateur : au moins 12 caractères/)).toBeInTheDocument()
  })

  test('mot de passe refusé par le serveur : message sous le champ, pas « lien invalide »', async () => {
    resetImpl = async () => {
      throw httpError(400, { success: false, message: ADMIN_RULE, errors: [{ field: 'password', message: ADMIN_RULE }] })
    }
    renderPage()
    submit('Broderie26!')

    expect(await screen.findByText(ADMIN_RULE)).toBeInTheDocument()
    expect(screen.getByLabelText('Nouveau mot de passe')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(/lien est invalide/)).not.toBeInTheDocument()
    expect(calls).toEqual([['abc123', 'Broderie26!']])
  })

  test('lien expiré : message du lien et nouvelle demande proposée', async () => {
    resetImpl = async () => { throw httpError(400, { success: false, message: 'Lien de réinitialisation invalide ou expiré.' }) }
    renderPage()
    submit('PointCompte2026!')

    expect(await screen.findByText('Ce lien est invalide ou a expiré. Veuillez faire une nouvelle demande.')).toBeInTheDocument()
  })

  test('mot de passe accepté : confirmation', async () => {
    resetImpl = async () => ({ success: true })
    renderPage()
    submit('PointCompte2026!')

    expect(await screen.findByText(/Mot de passe modifié/)).toBeInTheDocument()
  })
})
