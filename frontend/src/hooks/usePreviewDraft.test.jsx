import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PREVIEW_SOURCE, handlePreviewMessage, resetPreviewDrafts } from '../utils/livePreview.js'

/* Aperçu en direct : chaque page affiche le brouillon reçu de l'administration
   à la place du contenu enregistré, mise en forme comprise. */
let saved = {}
vi.mock('../services/legal.service.js', () => ({
  getAnnouncementBanner: () => Promise.resolve(saved.banner ?? null),
  getLegalContent: () => Promise.resolve({ success: true, data: saved.legal ?? {} }),
  getHomeContent: () => Promise.resolve(saved.home ?? {}),
  getAboutContent: () => Promise.resolve(saved.about ?? {}),
}))

import AnnouncementBanner from '../components/ui/AnnouncementBanner/AnnouncementBanner.jsx'
import CGV from '../pages/CGV/CGV.jsx'
import AdvantagesSection from '../pages/Home/sections/AdvantagesSection.jsx'

const draft = (page, data) => act(() => {
  handlePreviewMessage({
    source: window.parent, origin: window.location.origin,
    data: { source: PREVIEW_SOURCE, type: 'draft', page, data },
  })
})

const inRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('usePreviewDraft — pages de la boutique', () => {
  beforeEach(() => { saved = {} })
  afterEach(() => {
    resetPreviewDrafts()
    localStorage.clear()
  })

  test('accueil : le brouillon remplace le texte enregistré ; vide, le texte d\'origine revient', async () => {
    saved.home = { advantage_1_title: 'Texte enregistré', styles: {} }
    inRouter(<AdvantagesSection />)
    expect(await screen.findByText('Texte enregistré')).toBeInTheDocument()

    draft('home', { advantage_1_title: 'Texte en cours', styles: { advantage_1_title: { color: '#aa3366' } } })
    expect(screen.getByText('Texte en cours')).toHaveStyle({ color: '#aa3366' })

    draft('home', { advantage_1_title: '', styles: {} })
    expect(screen.queryByText('Texte en cours')).not.toBeInTheDocument()
    expect(screen.queryByText('Texte enregistré')).not.toBeInTheDocument()
  })

  test('CGV : texte et politique de retour suivent la saisie', async () => {
    inRouter(<CGV />)
    draft('legal', { cgv: 'Article premier.\n\nArticle second.', politique_retour: 'Retour sous 14 jours.', styles: {} })
    expect(screen.getByText('Article premier.')).toBeInTheDocument()
    expect(screen.getByText('Article second.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Politique de retour' })).toBeInTheDocument()
    expect(screen.getByText('Retour sous 14 jours.')).toBeInTheDocument()
  })

  test('bandeau : affiché tel que réglé, même fermé auparavant sur ce navigateur', async () => {
    localStorage.setItem('announcement_dismissed', 'Fermé du 24 au 31 décembre')
    inRouter(<AnnouncementBanner />)
    draft('banner', { text: 'Fermé du 24 au 31 décembre', link: null, style: { weight: 700 } })
    expect(screen.getByRole('status')).toHaveTextContent('Fermé du 24 au 31 décembre')
  })

  test('bandeau : un brouillon « masqué » (null) le retire de l\'aperçu', async () => {
    saved.banner = { text: 'Promotion d\'automne', link: null, style: null }
    inRouter(<AnnouncementBanner />)
    expect(await screen.findByRole('status')).toHaveTextContent('Promotion d\'automne')
    draft('banner', null)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  test('bandeau : fermer l\'aperçu n\'est pas retenu pour les vraies visites', async () => {
    inRouter(<AnnouncementBanner />)
    draft('banner', { text: 'Nouveautés', link: null, style: null })
    act(() => screen.getByRole('button', { name: 'Fermer l\'annonce' }).click())
    expect(localStorage.getItem('announcement_dismissed')).toBeNull()
  })
})
