import api from './api.js'

export async function getCoupons(params = {}) {
  const res = await api.get('/admin/coupons', { params })
  return res.data
}

export async function createCoupon(data) {
  const res = await api.post('/admin/coupons', data)
  return res.data
}

export async function updateCoupon(id, data) {
  const res = await api.put(`/admin/coupons/${id}`, data)
  return res.data
}

export async function deleteCoupon(id) {
  const res = await api.delete(`/admin/coupons/${id}`)
  return res.data
}
