import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

/* Non-régression CLI-05 — « case à cocher explicite (Oui/Non) ».
   Service remplacé par des fonctions ordinaires : Vitest 4 signale comme erreur
   le rejet renvoyé par un vi.fn(), même intercepté par le composant. */
let calls = []
let getImpl = async () => ({ data: { status: 'none' } })
let setImpl = async (subscribed) => ({ data: { status: subscribed ? 'subscribed' : 'none' } })
vi.mock('../../services/profile.service.js', () => ({
  getNewsletterPreference: () => getImpl(),
  setNewsletterPreference: (v) => { calls.push(v); return setImpl(v) },
}))

import NewsletterPreference from './NewsletterPreference.jsx'

const renderIt = () => render(<MemoryRouter><NewsletterPreference /></MemoryRouter>)

describe('NewsletterPreference — Oui / Non dans le compte', () => {
  beforeEach(() => {
    calls = []
    getImpl = async () => ({ data: { status: 'none' } })
    setImpl = async (subscribed) => ({ data: { status: subscribed ? 'subscribed' : 'none' } })
  })

  test('rien n\'est présélectionné avant de connaître l\'état réel', () => {
    getImpl = () => new Promise(() => {}) // chargement sans fin
    renderIt()
    expect(screen.getByLabelText('Oui, je souhaite la recevoir')).not.toBeChecked()
    expect(screen.getByLabelText('Non merci')).not.toBeChecked()
  })

  test('reflète l\'état enregistré', async () => {
    getImpl = async () => ({ data: { status: 'subscribed' } })
    renderIt()
    await waitFor(() => expect(screen.getByLabelText('Oui, je souhaite la recevoir')).toBeChecked())
  })

  test('choisir « Oui » inscrit la cliente et le confirme', async () => {
    const user = userEvent.setup()
    renderIt()
    await waitFor(() => expect(screen.getByLabelText('Non merci')).toBeChecked())

    await user.click(screen.getByLabelText('Oui, je souhaite la recevoir'))

    expect(calls).toEqual([true])
    expect(await screen.findByText('Vous êtes inscrite à la newsletter.')).toBeInTheDocument()
  })

  test('adresse non vérifiée : explique que l\'inscription attend la confirmation', async () => {
    const user = userEvent.setup()
    setImpl = async () => ({ data: { status: 'pending' } })
    renderIt()
    await waitFor(() => expect(screen.getByLabelText('Non merci')).toBeChecked())

    await user.click(screen.getByLabelText('Oui, je souhaite la recevoir'))
    expect(await screen.findByText(/dès que vous aurez confirmé votre adresse/)).toBeInTheDocument()
  })

  test('un échec rétablit le choix précédent et l\'explique', async () => {
    const user = userEvent.setup()
    setImpl = async () => { const e = new Error('500'); e.response = { data: { message: 'Erreur serveur.' } }; throw e }
    renderIt()
    await waitFor(() => expect(screen.getByLabelText('Non merci')).toBeChecked())

    await user.click(screen.getByLabelText('Oui, je souhaite la recevoir'))

    expect(await screen.findByText('Erreur serveur.')).toBeInTheDocument()
    expect(screen.getByLabelText('Non merci')).toBeChecked()
  })
})
