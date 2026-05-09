import api from './api.js'

export async function getOrders(params = {}) {
  const res = await api.get('/admin/orders', { params })
  return res.data
}

export async function getOrderById(id) {
  const res = await api.get(`/admin/orders/${id}`)
  return res.data
}

export async function updateOrderStatus(id, status, note) {
  const res = await api.put(`/admin/orders/${id}/status`, { status, note })
  return res.data
}

export async function sendTwintQr(orderId) {
  const res = await api.post(`/admin/orders/${orderId}/twint-email`)
  return res.data
}

export async function downloadInvoice(orderId) {
  const res = await api.get(`/admin/orders/${orderId}/invoice`, { responseType: 'blob' })
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `facture-${String(orderId).padStart(6, '0')}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
