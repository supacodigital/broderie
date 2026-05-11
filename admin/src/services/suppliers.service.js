import api from './api.js'

// Backend listes: { success, data: [], pagination }
// Backend ressource: { success, data: {} }
export async function getSuppliers(params = {}) {
  const res = await api.get('/admin/suppliers', { params })
  return { data: res.data.data ?? [], pagination: res.data.pagination ?? {} }
}

export async function getSupplierById(id) {
  const res = await api.get(`/admin/suppliers/${id}`)
  return res.data.data ?? null
}

export async function getSupplierDetails(id) {
  const res = await api.get(`/admin/suppliers/${id}/details`)
  return res.data.data ?? null
}

export async function createSupplier(data) {
  const res = await api.post('/admin/suppliers', data)
  return res.data.data ?? null
}

export async function updateSupplier(id, data) {
  const res = await api.put(`/admin/suppliers/${id}`, data)
  return res.data.data ?? null
}

export async function deleteSupplier(id) {
  await api.delete(`/admin/suppliers/${id}`)
}
