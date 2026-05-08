import api from './api.js'

/* Crée une commande depuis le panier actif */
export async function createOrder(payload) {
  const res = await api.post('/orders', payload)
  return res.data
}

/* Récupère les commandes du client connecté */
export async function getMyOrders(params = {}) {
  const res = await api.get('/orders', { params })
  return res.data
}

/* Récupère le détail d'une commande */
export async function getOrderById(id) {
  const res = await api.get(`/orders/${id}`)
  return res.data
}
