import api from './api.js'

export async function subscribe(email) {
  const res = await api.post('/newsletter/subscribe', { email })
  return res.data
}

/* Désinscription en un clic depuis le lien reçu par e-mail (CLI-05).
   Le jeton prouve que l'adresse est bien celle du destinataire. */
export async function unsubscribe(email, token) {
  const res = await api.post('/newsletter/unsubscribe', { email, token })
  return res.data
}
