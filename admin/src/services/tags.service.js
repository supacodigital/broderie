import api from './api.js'

// Backend: { success, data: [] }
export async function getTags(params = {}) {
  const res = await api.get('/admin/tags', { params })
  return res.data.data ?? []
}

export async function getTagById(id) {
  const res = await api.get(`/admin/tags/${id}`)
  return res.data.data ?? null
}

export async function createTag(data) {
  const res = await api.post('/admin/tags', data)
  return res.data.data ?? null
}

export async function updateTag(id, data) {
  const res = await api.put(`/admin/tags/${id}`, data)
  return res.data.data ?? null
}

export async function deleteTag(id) {
  await api.delete(`/admin/tags/${id}`)
}
