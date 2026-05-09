import api from './api.js'

export async function getLoyaltyKpis() {
  const res = await api.get('/admin/loyalty/kpis')
  return res.data
}

export async function getLoyaltyTiers() {
  const res = await api.get('/admin/loyalty/tiers')
  return res.data
}

export async function createLoyaltyTier(data) {
  const res = await api.post('/admin/loyalty/tiers', data)
  return res.data
}

export async function updateLoyaltyTier(id, data) {
  const res = await api.put(`/admin/loyalty/tiers/${id}`, data)
  return res.data
}

export async function deleteLoyaltyTier(id) {
  const res = await api.delete(`/admin/loyalty/tiers/${id}`)
  return res.data
}

export async function getLoyaltyAccounts(params = {}) {
  const res = await api.get('/admin/loyalty/accounts', { params })
  return res.data
}

export async function getLoyaltyRewards(params = {}) {
  const res = await api.get('/admin/loyalty/rewards', { params })
  return res.data
}
