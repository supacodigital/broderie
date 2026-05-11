import api from './api.js'

// Backend: { success, data: {} }
export async function getLoyaltyKpis() {
  const res = await api.get('/admin/loyalty/kpis')
  return res.data.data ?? {}
}

// Backend: { success, data: [] }
export async function getLoyaltyTiers() {
  const res = await api.get('/admin/loyalty/tiers')
  return res.data.data ?? []
}

export async function createLoyaltyTier(data) {
  const res = await api.post('/admin/loyalty/tiers', data)
  return res.data.data ?? null
}

export async function updateLoyaltyTier(id, data) {
  const res = await api.put(`/admin/loyalty/tiers/${id}`, data)
  return res.data.data ?? null
}

export async function deleteLoyaltyTier(id) {
  await api.delete(`/admin/loyalty/tiers/${id}`)
}

// Backend listes: { success, data: [], pagination }
export async function getLoyaltyAccounts(params = {}) {
  const res = await api.get('/admin/loyalty/accounts', { params })
  return { data: res.data.data ?? [], pagination: res.data.pagination ?? {} }
}

export async function getLoyaltyRewards(params = {}) {
  const res = await api.get('/admin/loyalty/rewards', { params })
  return { data: res.data.data ?? [], pagination: res.data.pagination ?? {} }
}
