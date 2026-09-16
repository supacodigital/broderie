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

/* Bandeau d'annonce affiché en haut de la boutique */
/* Page « Notre Histoire » — contenu éditorial modifiable par la cliente (ADM-08) */
export async function getAboutSettings() {
  const res = await api.get('/admin/settings/about')
  return res.data?.data ?? {}
}

export async function updateAboutSettings(data) {
  const res = await api.put('/admin/settings/about', data)
  return res.data?.data ?? {}
}

export async function getBannerSettings() {
  const res = await api.get('/admin/settings/banner')
  return res.data.data ?? {}
}

export async function updateBannerSettings(data) {
  const res = await api.put('/admin/settings/banner', data)
  return res.data.data ?? null
}

/* Retrait en boutique — adresse et horaires envoyés dans l'email « commande prête » */
export async function getPickupSettings() {
  const res = await api.get('/admin/settings/pickup')
  return res.data.data ?? {}
}

export async function updatePickupSettings(data) {
  const res = await api.put('/admin/settings/pickup', data)
  return res.data.data ?? {}
}

/* Coordonnées et délai imprimés sur la facture QR */
export async function getInvoiceSettings() {
  const res = await api.get('/admin/settings/invoice')
  return res.data.data ?? {}
}

export async function updateInvoiceSettings(data) {
  const res = await api.put('/admin/settings/invoice', data)
  return res.data.data ?? {}
}
