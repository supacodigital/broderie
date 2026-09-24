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

/* Textes éditables de la page d'accueil (ADM-08). Trois blocs les lisent sur la
   même page : la requête est partagée, puis gardée le temps de la visite. Un
   échec n'est pas mémorisé — la page garde alors ses textes d'origine. */
let homeContentRequest = null
export function getHomeContent() {
  if (!homeContentRequest) {
    homeContentRequest = api.get('/legal/home')
      .then(res => res.data?.data ?? {})
      .catch(err => { homeContentRequest = null; throw err })
  }
  return homeContentRequest
}
