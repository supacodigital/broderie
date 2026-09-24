import api from './api.js'

export async function createTwintIntent(orderId) {
  const res = await api.post(`/payments/twint/${orderId}`)
  return res.data.data
}

export async function createCardIntent(orderId) {
  const res = await api.post(`/payments/card/${orderId}`)
  return res.data.data
}

/* État du paiement d'une commande, vérifié auprès de Stripe par le serveur —
   au retour de l'app Twint ou de 3-D Secure, et au rechargement de la page de
   paiement. Valide la commande si le paiement a abouti. */
export async function syncPayment(orderId) {
  const res = await api.post(`/payments/sync/${orderId}`)
  return res.data.data
}
