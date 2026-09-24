import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Non-régression CLI-05 — information au moment de la collecte, double opt-in
const subscribeMock = vi.fn().mockResolvedValue({ success: true })
vi.mock('../../../services/newsletter.service.js', () => ({
  subscribe: (...args) => subscribeMock(...args),
}))
vi.mock('react-i18next', async () => {
  const fr = (await import('../../../i18n/fr/common.json')).default
  const get = (key) => key.split('.').reduce((o, k) => o?.[k], fr) ?? key
  return { useTranslation: () => ({ t: get, i18n: { language: 'fr' } }) }
})

import NewsletterSection from './NewsletterSection.jsx'

describe('NewsletterSection', () => {
  test('annonce la confirmation par e-mail et renvoie vers la protection des données', () => {
    render(<MemoryRouter><NewsletterSection /></MemoryRouter>)
    expect(screen.getByText(/Un e-mail de confirmation vous sera envoyé/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Protection des données' }))
      .toHaveAttribute('href', '/mentions-legales#donnees')
  })

  test('après envoi, invite à confirmer depuis la boîte e-mail — pas « vous êtes abonnée »', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><NewsletterSection /></MemoryRouter>)
    await user.type(screen.getByLabelText('Votre adresse email'), 'marie@test.ch')
    await user.click(screen.getByRole('button', { name: "S'abonner" }))

    expect(await screen.findByText(/Consultez votre boîte e-mail/)).toBeInTheDocument()
    expect(screen.queryByText(/Vous êtes maintenant abonnée/)).toBeNull()
  })

  /* CLI-10 — « Nouvelles collections, tutoriels exclusifs et offres réservées aux
     abonnées » : jamais annoncé par la boutique, et faux. Restait affiché après
     l'inscription. */
  test('ne promet aucun contenu, ni avant ni après l\'inscription', async () => {
    const user = userEvent.setup()
    const { container } = render(<MemoryRouter><NewsletterSection /></MemoryRouter>)
    const promise = /tutoriels|nouvelles collections|offres réservées/i
    expect(container.textContent).not.toMatch(promise)

    await user.type(screen.getByLabelText('Votre adresse email'), 'marie@test.ch')
    await user.click(screen.getByRole('button', { name: "S'abonner" }))
    await screen.findByText(/Consultez votre boîte e-mail/)

    expect(container.textContent).not.toMatch(promise)
  })
})
