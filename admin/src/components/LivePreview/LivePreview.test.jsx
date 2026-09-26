import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LivePreview, { PREVIEW_SOURCE, SHOP_ORIGIN } from './LivePreview.jsx'

/* Aperçu en direct : la boutique dans un cadre reçoit le brouillon dès
   qu'elle annonce être prête, puis à chaque modification. */
const frame = () => screen.getByTitle('Aperçu de la boutique')

// Annonce « prête » de la boutique (par défaut : depuis le cadre, bonne origine)
const shopReady = ({ origin = SHOP_ORIGIN, source = frame().contentWindow } = {}) => act(() => {
  window.dispatchEvent(new MessageEvent('message', { data: { source: PREVIEW_SOURCE, type: 'ready' }, origin, source }))
})

const sent = (spy, type) => spy.mock.calls.map(([msg]) => msg).filter(msg => msg.type === type)

const setup = (props = {}) => {
  const utils = render(
    <LivePreview path="/cgv" page="legal" draft={{ cgv: 'Texte', styles: {} }} focus={null} onClose={() => {}} {...props} />
  )
  const post = vi.spyOn(frame().contentWindow, 'postMessage').mockImplementation(() => {})
  return { ...utils, post }
}

describe('LivePreview', () => {
  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it('ouvre la page de la boutique en mode aperçu, et patiente jusqu\'à ce qu\'elle soit prête', () => {
    setup()
    expect(frame()).toHaveAttribute('src', `${SHOP_ORIGIN}/cgv?apercu=1`)
    expect(screen.getByRole('status')).toHaveTextContent('Chargement de la boutique…')
    shopReady()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('envoie le brouillon et le texte en cours d\'édition à la boutique, et à elle seule', () => {
    const { post } = setup({ focus: { key: 'cgv', path: '/cgv' } })
    expect(post).not.toHaveBeenCalled()
    shopReady()
    expect(post).toHaveBeenCalledWith(
      { source: PREVIEW_SOURCE, type: 'draft', page: 'legal', data: { cgv: 'Texte', styles: {} } }, SHOP_ORIGIN,
    )
    expect(post).toHaveBeenCalledWith({ source: PREVIEW_SOURCE, type: 'focus', key: 'cgv', path: '/cgv' }, SHOP_ORIGIN)
  })

  it('renvoie le brouillon à chaque modification', () => {
    const { post, rerender } = setup()
    shopReady()
    rerender(<LivePreview path="/cgv" page="legal" draft={{ cgv: 'Texte modifié', styles: {} }} focus={null} onClose={() => {}} />)
    expect(sent(post, 'draft').at(-1).data).toEqual({ cgv: 'Texte modifié', styles: {} })
  })

  it('bandeau masqué : « null » est transmis tel quel', () => {
    const { post } = setup({ page: 'banner', path: '/', draft: null })
    shopReady()
    expect(sent(post, 'draft')).toEqual([{ source: PREVIEW_SOURCE, type: 'draft', page: 'banner', data: null }])
  })

  it('boutique rechargée dans le cadre : le brouillon lui est renvoyé', () => {
    const { post } = setup()
    shopReady()
    shopReady()
    expect(sent(post, 'draft')).toHaveLength(2)
  })

  it('ignore une annonce venue d\'une autre origine ou d\'une autre fenêtre', () => {
    const { post } = setup()
    shopReady({ origin: 'https://pirate.example' })
    shopReady({ source: window })
    expect(post).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('boutique muette : le dit, et « Réessayer » recharge le cadre', async () => {
    vi.useFakeTimers()
    setup()
    const first = frame()
    act(() => vi.advanceTimersByTime(15000))
    expect(screen.getByRole('status')).toHaveTextContent('L’aperçu ne répond pas')
    act(() => screen.getByRole('button', { name: 'Réessayer' }).click())
    expect(frame()).not.toBe(first)
    expect(screen.getByRole('status')).toHaveTextContent('Chargement de la boutique…')
  })

  it('Ordinateur / Natel : la page est rendue à la largeur choisie, choix retenu', async () => {
    const user = userEvent.setup()
    setup()
    expect(frame().style.width).toBe('1280px')
    await user.click(screen.getByRole('button', { name: 'Natel' }))
    expect(frame().style.width).toBe('375px')
    expect(screen.getByRole('button', { name: 'Natel' })).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem('admin.previewDevice')).toBe('mobile')
  })

  it('« Fermer l\'aperçu » prévient la page', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    setup({ onClose })
    await user.click(screen.getByRole('button', { name: 'Fermer l’aperçu' }))
    expect(onClose).toHaveBeenCalled()
  })
})
