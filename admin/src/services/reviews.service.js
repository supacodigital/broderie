import api from './api.js'

// Backend listes: { success, data: [], pagination }
export async function getReviews(params = {}) {
  const res = await api.get('/admin/reviews', { params })
  return { data: res.data.data ?? [], pagination: res.data.pagination ?? {} }
}

export async function approveReview(id) {
  await api.put(`/admin/reviews/${id}/approve`)
}

export async function deleteReview(id) {
  await api.delete(`/admin/reviews/${id}`)
}
