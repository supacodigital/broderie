import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { PREVIEW_SOURCE, resetPreviewDrafts } from '../../../utils/livePreview.js'
import LivePreviewBridge from './LivePreviewBridge.jsx'

/* Aperçu en direct : la boutique ouvre la page du texte en cours d'édition,
   le fait défiler jusqu'à lui et l'encadre. */
function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>
}

const renderBridge = (url = '/') => render(
  <MemoryRouter initialEntries={[url]}>
    <LivePreviewBridge />
    <Where />
    <Routes>
      <Route path="/" element={<h1 data-apercu="hero_title">Titre</h1>} />
      <Route path="/mentions-legales" element={<><p data-apercu="mentions_legales">A</p><p data-apercu="mentions_legales">B</p></>} />
    </Routes>
  </MemoryRouter>
)

const send = (data) => act(() => {
  window.dispatchEvent(new MessageEvent('message', {
    data: { source: PREVIEW_SOURCE, ...data }, origin: window.location.origin, source: window,
  }))
})

describe('LivePreviewBridge', () => {
  let scrollIntoView
  beforeEach(() => {
    scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
  })
  afterEach(() => {
    delete Element.prototype.scrollIntoView
    resetPreviewDrafts()
  })

  test('annonce à l\'administration qu\'elle est prête', () => {
    const post = vi.spyOn(window, 'postMessage')
    renderBridge()
    expect(post).toHaveBeenCalledWith({ source: PREVIEW_SOURCE, type: 'ready' }, window.location.origin)
    post.mockRestore()
  })

  test('encadre le texte en cours d\'édition et le fait défiler jusqu\'à lui, puis le libère', async () => {
    renderBridge()
    send({ type: 'focus', key: 'hero_title', path: '/' })
    const title = screen.getByRole('heading', { name: 'Titre' })
    await waitFor(() => expect(title).toHaveAttribute('data-apercu-actif'))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    send({ type: 'focus', key: null, path: null })
    expect(title).not.toHaveAttribute('data-apercu-actif')
  })

  test('un brouillon ne refait pas défiler la page : seul un nouveau texte édité le fait', async () => {
    renderBridge()
    send({ type: 'focus', key: 'hero_title', path: '/' })
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    send({ type: 'draft', page: 'home', data: { hero_title: 'Titre modifié' } })
    send({ type: 'draft', page: 'home', data: { hero_title: 'Titre modifié encore' } })
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading')).toHaveAttribute('data-apercu-actif')
  })

  test('texte d\'une autre page : l\'ouvre, puis encadre tous ses paragraphes', async () => {
    renderBridge('/')
    send({ type: 'focus', key: 'mentions_legales', path: '/mentions-legales' })
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/mentions-legales'))
    await waitFor(() => {
      expect(screen.getByText('A')).toHaveAttribute('data-apercu-actif')
      expect(screen.getByText('B')).toHaveAttribute('data-apercu-actif')
    })
  })

  test('texte du bandeau (sans page) : reste sur la page affichée', async () => {
    renderBridge('/mentions-legales')
    send({ type: 'focus', key: 'banner_text', path: null })
    await new Promise(r => setTimeout(r, 20))
    expect(screen.getByTestId('where')).toHaveTextContent('/mentions-legales')
  })

  test('ignore une demande venue d\'un autre site', () => {
    renderBridge('/')
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { source: PREVIEW_SOURCE, type: 'focus', key: 'mentions_legales', path: '/mentions-legales' },
        origin: 'https://pirate.example', source: window,
      }))
    })
    expect(screen.getByTestId('where')).toHaveTextContent('/')
  })
})
