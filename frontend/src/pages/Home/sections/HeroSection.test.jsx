import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/* Mise en forme des textes réglée dans l'administration (26.09) : le bandeau
   principal applique ce que le serveur envoie, et rien d'autre. */
let homeContent = {}
vi.mock('../../../services/legal.service.js', () => ({
  getHomeContent: () => Promise.resolve(homeContent),
}))
vi.mock('react-i18next', async () => {
  const fr = (await import('../../../i18n/fr/common.json')).default
  const get = (key) => key.split('.').reduce((o, k) => o?.[k], fr) ?? key
  return {
    useTranslation: () => ({ t: get, i18n: { language: 'fr' } }),
    Trans: ({ i18nKey }) => get(i18nKey).replace(/<\/?\d>/g, ''),
  }
})

import HeroSection from './HeroSection.jsx'

const renderHero = () => render(<MemoryRouter><HeroSection /></MemoryRouter>)

describe('HeroSection — mise en forme depuis l\'administration', () => {
  beforeEach(() => { homeContent = {} })

  test('sans réglage, aucun style en ligne : la feuille de style du site s\'applique', async () => {
    homeContent = { hero_title: 'Broderie & point de croix', styles: {} }
    renderHero()
    const title = await screen.findByRole('heading', { level: 1, name: 'Broderie & point de croix' })
    expect(title.getAttribute('style')).toBeNull()
  })

  test('le titre et le bouton prennent la police, la graisse, la couleur et les effets choisis', async () => {
    homeContent = {
      hero_title: 'Broderie & point de croix',
      hero_cta: 'Voir la boutique',
      styles: {
        hero_title: { fontFamily: "'Lora', serif", weight: 700, size: 64, color: '#aa3366', align: 'center' },
        hero_cta: { uppercase: false, letterSpacing: 0 },
      },
    }
    renderHero()
    const title = await screen.findByRole('heading', { level: 1, name: 'Broderie & point de croix' })
    expect(title.style.fontFamily).toBe('"Lora", serif')
    expect(title.style.fontWeight).toBe('700')
    expect(title.style.color).toBe('rgb(170, 51, 102)')
    expect(title.style.textAlign).toBe('center')
    expect(title.style.fontSize).toMatch(/^clamp\(38px/)

    const cta = screen.getByRole('link', { name: 'Voir la boutique' })
    expect(cta.style.textTransform).toBe('none')
    expect(cta.style.letterSpacing).toBe('0em')
  })

  test('un texte non mis en forme reste intact à côté d\'un texte mis en forme', async () => {
    homeContent = { hero_title: 'Titre', hero_subtitle: 'Sous-titre', styles: { hero_title: { weight: 400 } } }
    renderHero()
    await screen.findByRole('heading', { level: 1, name: 'Titre' })
    expect(screen.getByText('Sous-titre').getAttribute('style')).toBeNull()
  })
})
