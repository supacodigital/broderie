import api from './api.js'

// Backend: { success, data: [] }
export async function getCategories(params = {}) {
  const res = await api.get('/admin/categories', { params })
  return res.data.data ?? []
}

export async function getCategoryById(id) {
  const res = await api.get(`/admin/categories/${id}`)
  return res.data.data ?? null
}

export async function createCategory(data) {
  const res = await api.post('/admin/categories', data)
  return res.data.data ?? null
}

export async function updateCategory(id, data) {
  const res = await api.put(`/admin/categories/${id}`, data)
  return res.data.data ?? null
}

export async function deleteCategory(id) {
  await api.delete(`/admin/categories/${id}`)
}
