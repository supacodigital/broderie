import api from './api.js'

export async function getLegalContent() {
  const res = await api.get('/legal')
  return res.data
}

/* Bandeau d'annonce — renvoie null quand il est désactivé ou vide côté admin */
export async function getAnnouncementBanner() {
  const res = await api.get('/legal/banner')
  return res.data?.data ?? null
}

/* Contenu éditable de la page « Notre Histoire » (ADM-08).
   Renvoie un objet dont les clés absentes ou vides signifient « garder le texte
   d'origine » — la page décide, elle seule connaît ses valeurs par défaut. */
export async function getAboutContent() {
  const res = await api.get('/legal/about')
  return res.data?.data ?? {}
}
