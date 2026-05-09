import api from './api.js'

export async function getProductReviews(productId, params = {}) {
  const res = await api.get(`/products/${productId}/reviews`, { params })
  return res.data
}

export async function createReview(productId, data) {
  const res = await api.post(`/products/${productId}/reviews`, data)
  return res.data
}

export async function getLatestReviews(params = {}) {
  const res = await api.get('/reviews', { params })
  return res.data
}
