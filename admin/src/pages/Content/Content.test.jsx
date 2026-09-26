import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

/* Contenu du site — aperçu en direct : ce qui est saisi dans l'éditeur part
   aussitôt vers la boutique affichée à côté, avant tout enregistrement. */
const FONTS = [{ key: 'lora', label: 'Lora', family: 'Lora', fallback: 'serif', category: 'serif', weights: [400, 700], italic: true }]

vi.mock('../../services/content.service.js', () => ({
  getHomeContent: vi.fn(() => Promise.resolve({ hero_title: 'Titre enregistré', styles: { hero_title: { font: 'lora' } } })),
  updateHomeContent: vi.fn(),
  getAboutContent: vi.fn(() => Promise.resolve({ styles: {} })),
  updateAboutContent: vi.fn(),
  getLegalContent: vi.fn(() => Promise.resolve({ cgv: '', mentions_legales: '', politique_retour: '', styles: {} })),
  updateLegalContent: vi.fn(),
  getBannerContent: vi.fn(() => Promise.resolve({ banner_enabled: '1', banner_text: 'Promotion', banner_link: '', styles: {} })),
  updateBannerContent: vi.fn(),
  getEmailContent: vi.fn(() => Promise.resolve({})),
  updateEmailContent: vi.fn(),
  getFontCatalog: vi.fn(() => Promise.resolve(FONTS)),
}))

import Content from './Content.jsx'
import { getHomeContent, getBannerContent } from '../../services/content.service.js'
import { PREVIEW_SOURCE, SHOP_ORIGIN } from '../../components/LivePreview/LivePreview.jsx'

const renderAt = (url) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/contenu" element={<Content />} />
      <Route path="/contenu/:section" element={<Content />} />
    </Routes>
  </MemoryRouter>
)

// Aperçu ouvert, boutique prête : renvoie l'espion des messages envoyés au cadre
async function openWithPreview(url) {
  localStorage.setItem('admin.contentPreview', '1')
  renderAt(url)
  const frame = await screen.findByTitle('Aperçu de la boutique')
  const post = vi.spyOn(frame.contentWindow, 'postMessage').mockImplementation(() => {})
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { source: PREVIEW_SOURCE, type: 'ready' }, origin: SHOP_ORIGIN, source: frame.contentWindow,
    }))
  })
  return post
}

// Plusieurs blocs ont un « Titre » : le premier est celui du bandeau principal
const heroTitle = async () => (await screen.findAllByLabelText('Titre'))[0]

const lastSent = (post, type) => post.mock.calls.map(([msg]) => msg).filter(msg => msg.type === type).at(-1)

describe('Contenu du site — aperçu en direct', () => {
  afterEach(() => localStorage.clear())

  it('fermé par défaut ; le bouton l\'ouvre et le choix est retenu', async () => {
    const user = userEvent.setup()
    renderAt('/contenu/accueil')
    expect(screen.queryByTitle('Aperçu de la boutique')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Aperçu en direct' }))
    expect(screen.getByTitle('Aperçu de la boutique')).toHaveAttribute('src', `${SHOP_ORIGIN}/?apercu=1`)
    expect(localStorage.getItem('admin.contentPreview')).toBe('1')
    await user.click(screen.getByRole('button', { name: 'Fermer l’aperçu' }))
    expect(screen.queryByTitle('Aperçu de la boutique')).not.toBeInTheDocument()
    expect(localStorage.getItem('admin.contentPreview')).toBe('0')
  })

  it('accueil : chaque frappe part vers la boutique, police convertie comme sur le serveur', async () => {
    const user = userEvent.setup()
    const post = await openWithPreview('/contenu/accueil')
    const title = await heroTitle()
    await user.clear(title)
    await user.type(title, 'Nouveau')
    expect(lastSent(post, 'draft')).toMatchObject({
      page: 'home',
      data: { hero_title: 'Nouveau', styles: { hero_title: { fontFamily: "'Lora', serif" } } },
    })
  })

  it('le texte en cours d\'édition est signalé avec sa page, puis libéré', async () => {
    const user = userEvent.setup()
    const post = await openWithPreview('/contenu/accueil')
    await user.click(await heroTitle())
    expect(lastSent(post, 'focus')).toMatchObject({ key: 'hero_title', path: '/' })
    await user.click(screen.getByLabelText('Sous-titre'))
    expect(lastSent(post, 'focus')).toMatchObject({ key: 'hero_subtitle', path: '/' })
    await user.click(screen.getByRole('heading', { name: 'Page d’accueil' }))
    expect(lastSent(post, 'focus')).toMatchObject({ key: null, path: null })
  })

  it('textes légaux : chaque texte ouvre sa propre page de la boutique', async () => {
    const user = userEvent.setup()
    const post = await openWithPreview('/contenu/textes-legaux')
    await user.click(await screen.findByLabelText('Texte des mentions légales'))
    expect(lastSent(post, 'focus')).toMatchObject({ key: 'mentions_legales', path: '/mentions-legales' })
    await user.click(screen.getByLabelText('Texte de la politique de retour'))
    expect(lastSent(post, 'focus')).toMatchObject({ key: 'politique_retour', path: '/cgv' })
  })

  it('bandeau : décocher « Afficher » le retire de l\'aperçu', async () => {
    const user = userEvent.setup()
    const post = await openWithPreview('/contenu/bandeau')
    await screen.findByLabelText('Texte de l’annonce')
    expect(lastSent(post, 'draft')).toMatchObject({ page: 'banner', data: { text: 'Promotion', link: null } })
    await user.click(screen.getByRole('checkbox', { name: 'Afficher le bandeau sur la boutique' }))
    expect(lastSent(post, 'draft')).toMatchObject({ page: 'banner', data: null })
  })

  it('e-mails : absents de la boutique, donc pas d\'aperçu', async () => {
    localStorage.setItem('admin.contentPreview', '1')
    renderAt('/contenu/e-mails')
    expect(screen.queryByRole('button', { name: 'Aperçu en direct' })).not.toBeInTheDocument()
    expect(screen.queryByTitle('Aperçu de la boutique')).not.toBeInTheDocument()
  })
})

/* Tableau de bord : une carte par contenu, avec son état ; toute la carte
   mène à l'éditeur, « Voir sur la boutique » reste un lien à part. */
describe('Contenu du site — tableau de bord', () => {
  it('chaque carte mène à son éditeur et, sauf les e-mails, à sa page de la boutique', async () => {
    renderAt('/contenu')
    expect(screen.getByRole('link', { name: 'Page d’accueil' })).toHaveAttribute('href', '/contenu/accueil')
    expect(screen.getByRole('link', { name: 'Textes légaux' })).toHaveAttribute('href', '/contenu/textes-legaux')
    expect(screen.getByRole('link', { name: 'Voir « Textes légaux » sur la boutique (nouvel onglet)' }))
      .toHaveAttribute('href', expect.stringMatching(/\/cgv$/))
    expect(screen.getByRole('link', { name: 'E-mails' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Voir « E-mails »/ })).not.toBeInTheDocument()
  })

  it('état de chaque page : textes personnalisés sur le total, mise en forme', async () => {
    renderAt('/contenu')
    const home = (await screen.findByRole('link', { name: 'Page d’accueil' })).closest('article')
    expect(await within(home).findByText('texte personnalisé')).toBeInTheDocument()
    expect(within(home).getByText('1')).toBeInTheDocument()
    expect(within(home).getByText('/ 21')).toBeInTheDocument()
    expect(within(home).getByText('1 texte mis en forme')).toBeInTheDocument()

    const legal = screen.getByRole('link', { name: 'Textes légaux' }).closest('article')
    expect(await within(legal).findByText('/ 3')).toBeInTheDocument()
    expect(within(legal).getByText('Aucune mise en forme')).toBeInTheDocument()
  })

  it('bandeau : en ligne, avec son texte en miniature ; masqué, dit comme tel', async () => {
    const { unmount } = renderAt('/contenu')
    const banner = screen.getByRole('link', { name: 'Bandeau d’annonce' }).closest('article')
    expect(await within(banner).findByText('En ligne')).toBeInTheDocument()
    expect(within(banner).getByText('Promotion')).toBeInTheDocument()
    unmount()

    getBannerContent.mockResolvedValueOnce({ banner_enabled: '0', banner_text: 'Soldes', banner_link: '', styles: {} })
    renderAt('/contenu')
    const hidden = screen.getByRole('link', { name: 'Bandeau d’annonce' }).closest('article')
    expect(await within(hidden).findByText('Masqué')).toBeInTheDocument()
  })

  it('une page qui ne se charge pas le dit, les autres s\'affichent ; « Réessayer » recharge', async () => {
    const user = userEvent.setup()
    getHomeContent.mockRejectedValueOnce(new Error('réseau'))
    renderAt('/contenu')
    const home = screen.getByRole('link', { name: 'Page d’accueil' }).closest('article')
    expect(await within(home).findByText(/Impossible de charger l’état/)).toBeInTheDocument()
    expect(await screen.findByText('En ligne')).toBeInTheDocument()
    await user.click(within(home).getByRole('button', { name: 'Réessayer' }))
    expect(await within(home).findByText('1 texte mis en forme')).toBeInTheDocument()
  })
})
