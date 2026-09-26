/* Aperçu en direct (Contenu du site, administration).

   L'administration affiche la boutique dans un cadre, avec « ?apercu » dans
   l'adresse, et lui envoie à chaque frappe le brouillon de la page en cours
   d'édition. La boutique l'affiche à la place du contenu enregistré — dans ce
   cadre seulement : rien n'est enregistré, les visiteurs n'en voient rien.

   Messages acceptés du seul cadre parent, et seulement s'il est servi par
   l'administration (même domaine en production) :
     { source, type: 'draft', page: 'home' | 'about' | 'legal' | 'banner', data }
       data : même forme que la réponse publique correspondante (/legal/…) ;
              bandeau : { text, link, style } ou null (masqué)
     { source, type: 'focus', key, path }
       texte en cours d'édition : la boutique ouvre sa page, le fait défiler
       jusqu'à lui et l'encadre ; key null → plus rien d'encadré
   Au chargement, la boutique annonce { source, type: 'ready' } au parent. */

export const PREVIEW_SOURCE = 'apc-apercu'
const PAGES = ['home', 'about', 'legal', 'banner']

/* Administration de développement : port fixé dans admin/package.json.
   En production, administration et boutique partagent le domaine. */
const DEV_ADMIN_ORIGIN = 'http://localhost:5174'

export function allowedParentOrigins() {
  const origins = [window.location.origin]
  if (import.meta.env.DEV) origins.push(DEV_ADMIN_ORIGIN)
  return origins
}

// Mode aperçu : dans un cadre, ouvert par l'administration. Fixé au chargement,
// il survit à la navigation dans le cadre (l'adresse perd alors « ?apercu »).
const inFrame = () => {
  try { return window.self !== window.top } catch { return true }
}
export const isPreviewMode = typeof window !== 'undefined'
  && inFrame()
  && new URLSearchParams(window.location.search).has('apercu')

/* Repère posé sur chaque texte éditable, en mode aperçu uniquement : c'est par
   lui que la boutique retrouve le texte en cours d'édition. */
export const previewTarget = (key) => (isPreviewMode ? { 'data-apercu': key } : null)

// ── Brouillons reçus, par page ──
let drafts = {}
const listeners = new Set()

export const subscribeDrafts = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const getDrafts = () => drafts

/* Traite un message reçu. Renvoie la demande de mise en évidence (focus) pour
   le composant qui pilote la navigation, sinon null. */
export function handlePreviewMessage(event) {
  if (event.source !== window.parent || !allowedParentOrigins().includes(event.origin)) return null
  const msg = event.data
  if (!msg || typeof msg !== 'object' || msg.source !== PREVIEW_SOURCE) return null

  if (msg.type === 'draft' && PAGES.includes(msg.page)) {
    const data = msg.data
    const valid = msg.page === 'banner'
      ? data === null || (typeof data === 'object' && typeof data.text === 'string')
      : data !== null && typeof data === 'object' && !Array.isArray(data)
    if (valid) {
      drafts = { ...drafts, [msg.page]: data }
      listeners.forEach(listener => listener())
    }
    return null
  }
  if (msg.type === 'focus') {
    // Clé de texte (hero_title…) : elle sert de sélecteur, rien d'autre n'est admis
    const key = typeof msg.key === 'string' && /^[a-z0-9_]{1,64}$/.test(msg.key) ? msg.key : null
    const path = typeof msg.path === 'string' && msg.path.startsWith('/') && !msg.path.startsWith('//') ? msg.path : null
    return { key, path }
  }
  return null
}

// Annonce au parent que la boutique est prête à recevoir le brouillon
export function announceReady() {
  allowedParentOrigins().forEach(origin => {
    window.parent.postMessage({ source: PREVIEW_SOURCE, type: 'ready' }, origin)
  })
}

// Remise à zéro — tests uniquement
export function resetPreviewDrafts() {
  drafts = {}
  listeners.forEach(listener => listener())
}
