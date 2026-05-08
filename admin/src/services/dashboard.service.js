import api from './api.js'

/* KPIs résumé du tableau de bord */
export async function fetchDashboardStats() {
  const res = await api.get('/admin/dashboard/stats')
  return res.data
}

/* Commandes récentes */
export async function fetchRecentOrders(limit = 8) {
  const res = await api.get(`/admin/orders?limit=${limit}&sort=created_at&order=desc`)
  return res.data
}

/* Stock critique (≤ 5 unités) */
export async function fetchLowStock(limit = 10) {
  const res = await api.get(`/admin/products?low_stock=true&limit=${limit}`)
  return res.data
}
