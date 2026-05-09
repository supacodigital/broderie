import api from './api.js'

export async function getSuppliers(params = {}) {
  const res = await api.get('/admin/suppliers', { params })
  return res.data
}

export async function getSupplierById(id) {
  const res = await api.get(`/admin/suppliers/${id}`)
  return res.data
}

export async function getSupplierDetails(id) {
  const res = await api.get(`/admin/suppliers/${id}/details`)
  return res.data
}

export async function createSupplier(data) {
  const res = await api.post('/admin/suppliers', data)
  return res.data
}

export async function updateSupplier(id, data) {
  const res = await api.put(`/admin/suppliers/${id}`, data)
  return res.data
}

export async function deleteSupplier(id) {
  const res = await api.delete(`/admin/suppliers/${id}`)
  return res.data
}
