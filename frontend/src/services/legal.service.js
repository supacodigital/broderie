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
