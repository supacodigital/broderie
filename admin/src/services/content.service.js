import api from './api.js'

/* Contenu du site — réservé au super-administrateur (ADM-08, espace dédié
   depuis le 26.09). Chaque page renvoie ses textes et leur mise en forme :
   { ...textes, styles: { cléDuTexte: { font, weight, size, … } } }.
   L'enregistrement accepte la même forme : textes et mise en forme partent
   ensemble et sont enregistrés d'un bloc. */

export async function getHomeContent() {
  const res = await api.get('/admin/settings/home')
  return res.data?.data ?? {}
}

export async function updateHomeContent(data) {
  const res = await api.put('/admin/settings/home', data)
  return res.data?.data ?? {}
}

/* Page « Notre Histoire » (la cliente l'appelle « Qui sommes-nous ») */
export async function getAboutContent() {
  const res = await api.get('/admin/settings/about')
  return res.data?.data ?? {}
}

export async function updateAboutContent(data) {
  const res = await api.put('/admin/settings/about', data)
  return res.data?.data ?? {}
}

/* Bandeau d'annonce affiché en haut de la boutique */
export async function getBannerContent() {
  const res = await api.get('/admin/settings/banner')
  return res.data?.data ?? {}
}

export async function updateBannerContent(data) {
  const res = await api.put('/admin/settings/banner', data)
  return res.data?.data ?? {}
}

/* CGV, mentions légales, politique de retour */
export async function getLegalContent() {
  const res = await api.get('/admin/settings/legal')
  return res.data?.data ?? {}
}

export async function updateLegalContent(data) {
  const res = await api.put('/admin/settings/legal', data)
  return res.data?.data ?? {}
}

/* Textes des e-mails envoyés à l'inscription (CLI-11).
   Renvoie { values, defaults } : les textes saisis, et le texte actuellement
   envoyé quand un champ est vide. Pas de mise en forme : les messageries
   (Gmail, Outlook) ignorent la plupart des polices web. */
export async function getEmailContent() {
  const res = await api.get('/admin/settings/emails')
  return res.data?.data ?? { values: {}, defaults: {} }
}

export async function updateEmailContent(data) {
  const res = await api.put('/admin/settings/emails', data)
  return res.data?.data ?? { values: {}, defaults: {} }
}

/* Polices proposées pour la mise en forme — le catalogue vit sur le serveur,
   qui valide aussi les enregistrements. Lu une fois par visite. */
let fontCatalogRequest = null
export function getFontCatalog() {
  if (!fontCatalogRequest) {
    fontCatalogRequest = api.get('/admin/settings/fonts')
      .then(res => res.data?.data ?? [])
      .catch(err => { fontCatalogRequest = null; throw err })
  }
  return fontCatalogRequest
}
