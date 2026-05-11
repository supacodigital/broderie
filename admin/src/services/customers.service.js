import api from './api.js'

// Backend listes: { success, data: [], pagination }
// Backend ressource: { success, data: {} }
export async function getCustomers(params = {}) {
  const res = await api.get('/admin/customers', { params })
  return { data: res.data.data ?? [], pagination: res.data.pagination ?? {} }
}

export async function getCustomerById(id) {
  const res = await api.get(`/admin/customers/${id}`)
  return res.data.data ?? null
}
