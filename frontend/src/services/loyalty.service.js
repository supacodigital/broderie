import api from './api.js'

export async function getLoyaltyAccount() {
  const res = await api.get('/loyalty/me')
  return res.data.data
}

export async function getLoyaltyRewards() {
  const res = await api.get('/loyalty/me/rewards')
  return res.data.data ?? []
}
