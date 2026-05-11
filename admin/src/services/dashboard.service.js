import api from './api.js'

// Backend: { success, data: { stats, chart, topProducts, lowStock } }
export async function fetchDashboardStats() {
  const res = await api.get('/admin/dashboard/stats')
  return res.data.data ?? {}
}

// Backend listes: { success, data: [], pagination }
export async function fetchRecentOrders(limit = 8) {
  const res = await api.get(`/admin/orders?limit=${limit}&sort=created_at&order=desc`)
  return res.data.data ?? []
}

export async function fetchLowStock(limit = 10) {
  const res = await api.get(`/admin/products?low_stock=true&limit=${limit}`)
  return res.data.data ?? []
}
