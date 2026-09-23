import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/* Non-régression CLI-05 — atterrissage du lien de confirmation (double opt-in).
   Le service est remplacé par une fonction ordinaire et non par vi.fn() :
   Vitest 4 signale comme erreur le rejet renvoyé par un vi.fn(), même quand le
   composant l'intercepte — ce qui rendait le cas « lien expiré » intestable. */
let calls = []
let confirmImpl = async () => ({})
vi.mock('../../services/newsletter.service.js', () => ({
  confirmSubscription: (...args) => { calls.push(args); return confirmImpl(...args) },
}))

import NewsletterConfirm from './NewsletterConfirm.jsx'

const renderAt = (url) => render(
  <MemoryRouter initialEntries={[url]}><NewsletterConfirm /></MemoryRouter>
)

describe('NewsletterConfirm', () => {
  beforeEach(() => { calls = [] })

  test('confirme l\'inscription dès l\'ouverture du lien', async () => {
    confirmImpl = async () => ({ message: 'Votre inscription à la newsletter est confirmée. Merci !' })
    renderAt('/newsletter/confirmation?email=marie%40test.ch&token=123.abc')

    expect(await screen.findByText('Inscription confirmée')).toBeInTheDocument()
    expect(calls).toEqual([['marie@test.ch', '123.abc']])
    expect(screen.getByText(/désinscrire à tout moment/)).toBeInTheDocument()
  })

  test('affiche le message du serveur si le lien a expiré', async () => {
    confirmImpl = async () => {
      const err = new Error('400')
      err.response = { data: { message: 'Ce lien de confirmation est invalide ou a expiré.' } }
      throw err
    }
    renderAt('/newsletter/confirmation?email=marie%40test.ch&token=123.abc')

    expect(await screen.findByText('Ce lien de confirmation est invalide ou a expiré.')).toBeInTheDocument()
  })

  test('un lien incomplet n\'appelle pas le serveur', () => {
    renderAt('/newsletter/confirmation?email=marie%40test.ch')
    expect(screen.getByText("Ce lien n'est plus valable")).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })
})
