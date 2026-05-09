import api from './api.js'

export async function getReviews(params = {}) {
  const res = await api.get('/admin/reviews', { params })
  return res.data
}

export async function approveReview(id) {
  const res = await api.put(`/admin/reviews/${id}/approve`)
  return res.data
}

export async function deleteReview(id) {
  const res = await api.delete(`/admin/reviews/${id}`)
  return res.data
}
