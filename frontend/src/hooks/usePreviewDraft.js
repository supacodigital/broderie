import { useSyncExternalStore } from 'react'
import { subscribeDrafts, getDrafts } from '../utils/livePreview.js'

/* Brouillon d'une page envoyé par l'administration (aperçu en direct), à
   afficher à la place du contenu enregistré. undefined tant qu'aucun brouillon
   n'est arrivé — toujours le cas hors aperçu. Bandeau : null = masqué. */
export function usePreviewDraft(page) {
  const drafts = useSyncExternalStore(subscribeDrafts, getDrafts, getDrafts)
  return drafts[page]
}
