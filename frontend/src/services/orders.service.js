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

/* Télécharge la facture QR PDF d'une commande (déclenche le téléchargement navigateur) */
export async function downloadInvoice(id) {
  const res = await api.get(`/orders/${id}/invoice`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `facture-${String(id).padStart(6, '0')}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
