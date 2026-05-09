import api from './api.js'

export async function createTwintIntent(orderId) {
  const res = await api.post(`/payments/twint/${orderId}`)
  return res.data.data
}

export async function createCardIntent(orderId) {
  const res = await api.post(`/payments/card/${orderId}`)
  return res.data.data
}
