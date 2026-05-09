import api from './api.js'

export async function getCustomers(params = {}) {
  const res = await api.get('/admin/customers', { params })
  return res.data
}

export async function getCustomerById(id) {
  const res = await api.get(`/admin/customers/${id}`)
  return res.data
}
