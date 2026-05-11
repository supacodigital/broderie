import api from './api.js'

// Backend: { success, data: {} }
export async function getStoreSettings() {
  const res = await api.get('/admin/settings/store')
  return res.data.data ?? {}
}

export async function updateStoreSettings(data) {
  const res = await api.put('/admin/settings/store', data)
  return res.data.data ?? null
}

export async function getTaxRates() {
  const res = await api.get('/admin/settings/tax-rates')
  return res.data.data ?? []
}

export async function updateTaxRates(rates) {
  const res = await api.put('/admin/settings/tax-rates', { rates })
  return res.data.data ?? null
}

export async function getShippingRates() {
  const res = await api.get('/admin/settings/shipping')
  return res.data.data ?? []
}

export async function updateShippingRates(rates) {
  const res = await api.put('/admin/settings/shipping', { rates })
  return res.data.data ?? null
}

export async function getLegalSettings() {
  const res = await api.get('/admin/settings/legal')
  return res.data.data ?? {}
}

export async function updateLegalSettings(data) {
  const res = await api.put('/admin/settings/legal', data)
  return res.data.data ?? null
}
