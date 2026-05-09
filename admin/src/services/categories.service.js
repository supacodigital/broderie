import api from './api.js'

export async function getCategories(params = {}) {
  const res = await api.get('/admin/categories', { params })
  return res.data
}

export async function getCategoryById(id) {
  const res = await api.get(`/admin/categories/${id}`)
  return res.data
}

export async function createCategory(data) {
  const res = await api.post('/admin/categories', data)
  return res.data
}

export async function updateCategory(id, data) {
  const res = await api.put(`/admin/categories/${id}`, data)
  return res.data
}

export async function deleteCategory(id) {
  const res = await api.delete(`/admin/categories/${id}`)
  return res.data
}
