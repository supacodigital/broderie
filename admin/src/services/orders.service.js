import api from './api.js'

// Backend listes: { success, data: [], pagination }
// Backend ressource: { success, data: {} }
export async function getOrders(params = {}) {
  const res = await api.get('/admin/orders', { params })
  return { data: res.data.data ?? [], pagination: res.data.pagination ?? {} }
}

export async function getOrderById(id) {
  const res = await api.get(`/admin/orders/${id}`)
  return res.data.data ?? null
}

export async function updateOrderStatus(id, status, note) {
  const res = await api.put(`/admin/orders/${id}/status`, { status, note })
  return res.data.data ?? null
}

export async function sendTwintQr(orderId) {
  await api.post(`/admin/orders/${orderId}/twint-email`)
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
