import { describe, test, expect, vi, afterEach } from 'vitest'
import {
  PREVIEW_SOURCE, handlePreviewMessage, getDrafts, subscribeDrafts, resetPreviewDrafts,
  announceReady, allowedParentOrigins, isPreviewMode, previewTarget,
} from './livePreview.js'

/* Aperçu en direct : la boutique n'accepte un brouillon que de l'administration,
   dans le cadre qui l'affiche. */
const fromAdmin = (data, overrides = {}) => ({
  source: window.parent,
  origin: window.location.origin,
  data: { source: PREVIEW_SOURCE, ...data },
  ...overrides,
})

describe('livePreview — messages de l\'administration', () => {
  afterEach(() => resetPreviewDrafts())

  test('un brouillon de page est retenu et les pages abonnées sont prévenues', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeDrafts(listener)
    handlePreviewMessage(fromAdmin({ type: 'draft', page: 'home', data: { hero_title: 'Nouveau titre', styles: {} } }))
    expect(getDrafts().home).toEqual({ hero_title: 'Nouveau titre', styles: {} })
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  test('bandeau : null (masqué) est un brouillon valable, un objet sans texte non', () => {
    handlePreviewMessage(fromAdmin({ type: 'draft', page: 'banner', data: null }))
    expect(getDrafts()).toHaveProperty('banner', null)
    handlePreviewMessage(fromAdmin({ type: 'draft', page: 'banner', data: { link: '/catalogue' } }))
    expect(getDrafts().banner).toBeNull()
  })

  test('ignore un message d\'une autre origine, d\'une autre fenêtre ou sans l\'étiquette de l\'aperçu', () => {
    handlePreviewMessage(fromAdmin({ type: 'draft', page: 'home', data: { hero_title: 'x' } }, { origin: 'https://pirate.example' }))
    handlePreviewMessage(fromAdmin({ type: 'draft', page: 'home', data: { hero_title: 'x' } }, { source: {} }))
    handlePreviewMessage({ source: window.parent, origin: window.location.origin, data: { type: 'draft', page: 'home', data: {} } })
    expect(getDrafts()).toEqual({})
  })

  test('ignore une page inconnue ou des données qui ne sont pas un objet', () => {
    handlePreviewMessage(fromAdmin({ type: 'draft', page: 'checkout', data: {} }))
    handlePreviewMessage(fromAdmin({ type: 'draft', page: 'home', data: ['x'] }))
    handlePreviewMessage(fromAdmin({ type: 'draft', page: 'about', data: 'texte' }))
    expect(getDrafts()).toEqual({})
  })

  test('texte en cours d\'édition : clé et page renvoyées, rien d\'autre admis', () => {
    expect(handlePreviewMessage(fromAdmin({ type: 'focus', key: 'mentions_legales', path: '/mentions-legales' })))
      .toEqual({ key: 'mentions_legales', path: '/mentions-legales' })
    expect(handlePreviewMessage(fromAdmin({ type: 'focus', key: null, path: null })))
      .toEqual({ key: null, path: null })
    // La clé sert de sélecteur : ni guillemet ni crochet
    expect(handlePreviewMessage(fromAdmin({ type: 'focus', key: 'a"] , body', path: '/' })).key).toBeNull()
    // Jamais une adresse d'un autre site
    expect(handlePreviewMessage(fromAdmin({ type: 'focus', key: 'cgv', path: '//pirate.example' })).path).toBeNull()
    expect(handlePreviewMessage(fromAdmin({ type: 'focus', key: 'cgv', path: 'https://pirate.example' })).path).toBeNull()
  })

  test('annonce « prête » à l\'administration, et à elle seule', () => {
    const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {})
    announceReady()
    expect(post).toHaveBeenCalledWith({ source: PREVIEW_SOURCE, type: 'ready' }, window.location.origin)
    allowedParentOrigins().forEach(origin => expect(post).toHaveBeenCalledWith(expect.anything(), origin))
    expect(post.mock.calls.every(([, origin]) => origin !== '*')).toBe(true)
    post.mockRestore()
  })

  test('hors cadre (visite normale) : pas de mode aperçu, aucun repère dans la page', () => {
    expect(isPreviewMode).toBe(false)
    expect(previewTarget('hero_title')).toBeNull()
  })
})
