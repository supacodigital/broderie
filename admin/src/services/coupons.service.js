import api from './api.js'

// Backend listes: { success, data: [], pagination }
export async function getCoupons(params = {}) {
  const res = await api.get('/admin/coupons', { params })
  return { data: res.data.data ?? [], pagination: res.data.pagination ?? {} }
}

export async function createCoupon(data) {
  const res = await api.post('/admin/coupons', data)
  return res.data.data ?? null
}

export async function updateCoupon(id, data) {
  const res = await api.put(`/admin/coupons/${id}`, data)
  return res.data.data ?? null
}

export async function deleteCoupon(id) {
  await api.delete(`/admin/coupons/${id}`)
}
