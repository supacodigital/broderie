import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/* Audit cookies du 25.09 : le lien « Politique de confidentialité » menait à
   la page 404 (/confidentialite n'existe pas), et le texte annonçait un cookie
   de langue qui n'existe pas. */
const logConsentMock = vi.fn()
vi.mock('../../../services/consent.service.js', () => ({
  logConsent: (...args) => logConsentMock(...args),
}))

import CookieBanner from './CookieBanner.jsx'

const renderBanner = () => render(<MemoryRouter><CookieBanner /></MemoryRouter>)

describe('CookieBanner', () => {
  beforeEach(() => {
    localStorage.clear()
    logConsentMock.mockReset()
  })

  test('décrit exactement les cookies du site', () => {
    renderBanner()
    expect(screen.getByText(/que des cookies nécessaires à son fonctionnement/)).toBeInTheDocument()
    expect(screen.getByText(/Aucune publicité ni mesure d'audience/)).toBeInTheDocument()
    expect(screen.queryByText(/langue/)).not.toBeInTheDocument()
  })

  test('le lien mène aux mentions légales, section données personnelles', () => {
    renderBanner()
    fireEvent.click(screen.getByRole('button', { name: /En savoir plus/ }))
    expect(screen.getByRole('link', { name: 'Données personnelles et cookies' }))
      .toHaveAttribute('href', '/mentions-legales#donnees')
  })

  test('le choix est enregistré avec la version 1.1', () => {
    renderBanner()
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }))

    expect(JSON.parse(localStorage.getItem('cookie_consent'))).toMatchObject({ accepted: false, version: '1.1' })
    expect(logConsentMock).toHaveBeenCalledWith('cookies', false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('un choix fait sur l\'ancien texte (1.0) redemande l\'avis', () => {
    localStorage.setItem('cookie_consent', JSON.stringify({ accepted: true, version: '1.0', at: 1 }))
    renderBanner()
    expect(screen.getByRole('dialog', { name: 'Consentement aux cookies' })).toBeInTheDocument()
  })

  test('un choix déjà fait sur le texte actuel n\'affiche plus le bandeau', () => {
    localStorage.setItem('cookie_consent', JSON.stringify({ accepted: true, version: '1.1', at: 1 }))
    renderBanner()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
