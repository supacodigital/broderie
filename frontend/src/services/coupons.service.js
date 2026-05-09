import api from './api.js'

export async function validateCoupon(code, subtotal) {
  const res = await api.post('/coupons/validate', { code, subtotal })
  return res.data
}
