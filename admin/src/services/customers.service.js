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

// Fiche client modifiée par la boutique — prénom, nom et e-mail (CLI-06)
export async function updateCustomer(id, data) {
  const res = await api.put(`/admin/customers/${id}`, data)
  return res.data.data ?? null
}

// Adresses de la cliente, gérées par la boutique — renvoient la fiche à jour
export async function createCustomerAddress(customerId, data) {
  const res = await api.post(`/admin/customers/${customerId}/addresses`, data)
  return res.data.data ?? null
}

export async function updateCustomerAddress(customerId, addressId, data) {
  const res = await api.put(`/admin/customers/${customerId}/addresses/${addressId}`, data)
  return res.data.data ?? null
}

export async function deleteCustomerAddress(customerId, addressId) {
  await api.delete(`/admin/customers/${customerId}/addresses/${addressId}`)
}
