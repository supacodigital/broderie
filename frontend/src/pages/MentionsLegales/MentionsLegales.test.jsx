import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/* Audit cookies et données personnelles du 25.09. */
let legalText = ''
vi.mock('../../services/legal.service.js', () => ({
  getLegalContent: () => Promise.resolve({ data: { mentions_legales: legalText } }),
}))

import MentionsLegales from './MentionsLegales.jsx'

const renderAt = (url = '/mentions-legales') => render(
  <MemoryRouter initialEntries={[url]}><MentionsLegales /></MemoryRouter>
)

describe('MentionsLegales', () => {
  beforeEach(() => { legalText = '' })

  test('plus aucun champ « à compléter » : titulaire et IDE renseignés', () => {
    const { container } = renderAt()
    expect(container.textContent).not.toMatch(/à compléter|XXX/)
    expect(container.textContent).toContain('Titulaire\u00a0: Julie Guerle, raison individuelle')
    expect(container.textContent).toContain('CHE-201.783.009 TVA')
  })

  /* Les coordonnées s'affichaient bout à bout sur une seule ligne. */
  test('les coordonnées de l\'éditeur s\'affichent ligne par ligne', () => {
    const { container } = renderAt()
    const editeur = container.querySelector('#editeur p')
    expect(editeur.querySelectorAll('br')).toHaveLength(5)
  })

  test('aucune affirmation inexacte sur les cookies', () => {
    const { container } = renderAt()
    const text = container.textContent
    expect(text).not.toMatch(/analytiques|via le bandeau de consentement|exclusivement en Suisse/)
    expect(text).toContain('cartSession')
    expect(text).toContain('refreshToken')
  })

  test('prestataires et transferts à l\'étranger indiqués', () => {
    const { container } = renderAt()
    const donnees = container.querySelector('#donnees').textContent
    expect(donnees).toContain('Infomaniak Network SA')
    expect(donnees).toContain('La Poste Suisse SA')
    expect(donnees).toContain('Stripe Payments Europe Ltd')
    expect(donnees).toContain('Swiss-U.S. Data Privacy Framework')
  })

  /* Le lien du bandeau cookies et des e-mails ouvrait la page en haut. */
  test('une adresse avec #donnees fait défiler jusqu\'à la section', () => {
    const scrolled = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function () { scrolled.push(this.id) }
    renderAt('/mentions-legales#donnees')
    Element.prototype.scrollIntoView = original
    expect(scrolled).toEqual(['donnees'])
  })
})

/* Plus aucun appel à Google Fonts depuis la boutique : les polices sont servies
   par le site (src/fonts.css). */
describe('Polices servies par le site', () => {
  const read = (file) => fs.readFileSync(path.resolve(here, '../../..', file), 'utf8')

  test('ni la feuille de style ni la page ne contactent Google', () => {
    expect(read('src/index.css')).not.toMatch(/googleapis|gstatic/)
    expect(read('index.html')).not.toMatch(/googleapis|gstatic/)
  })

  test('chaque police déclarée existe dans le projet', () => {
    const css = read('src/fonts.css')
    const files = [...css.matchAll(/url\('\.\/(assets\/fonts\/[^']+)'\)/g)].map((m) => m[1])
    // 22 pour les polices du site + 26 pour celles proposées à la mise en forme (26.09)
    expect(files.length).toBe(48)
    for (const file of new Set(files)) {
      expect(fs.existsSync(path.resolve(here, '../..', file))).toBe(true)
    }
  })
})
