import api from './api.js'

// Backend listes: { success, data: [], pagination }
// Backend ressource: { success, data: {} }
export async function getProducts(params = {}) {
  const res = await api.get('/admin/products', { params })
  return { data: res.data.data ?? [], pagination: res.data.pagination ?? {} }
}

/* Liste des marques / éditeurs pour le filtre de la liste produits.
   Route publique du catalogue : elle ne retourne que les marques ayant au moins
   un produit actif — une gamme entièrement désactivée n'apparaît donc pas dans
   le filtre. Acceptable ici, le filtre servant à retrouver des produits en vente. */
// Nombre de fiches à compléter : { noPhoto, noWeight, noSupplier }
export async function getProductQuality() {
  const res = await api.get('/admin/products/quality')
  return res.data.data ?? null
}

export async function getBrands() {
  const res = await api.get('/products/brands')
  return res.data.data ?? []
}

export async function getProductById(id) {
  const res = await api.get(`/admin/products/${id}`)
  return res.data.data ?? null
}

/* Historique des prix d'un produit (ADM-21) */
export async function getPriceHistory(id, params = {}) {
  const res = await api.get(`/admin/products/${id}/price-history`, { params })
  return res.data
}

export async function createProduct(data) {
  const res = await api.post('/admin/products', data)
  return res.data.data ?? null
}

export async function updateProduct(id, data) {
  const res = await api.put(`/admin/products/${id}`, data)
  return res.data.data ?? null
}

export async function deleteProduct(id) {
  await api.delete(`/admin/products/${id}`)
}

// Persiste l'ordre des slots de la vitrine home bento (drag & drop) — productIds[0] = grande carte
// Vitrine d'accueil : ajoute ou retire un produit sans toucher au reste de sa fiche
export async function setProductFeatured(id, isFeatured) {
  const res = await api.put(`/admin/products/${id}/featured`, { isFeatured })
  return res.data.data ?? null
}

export async function updateFeaturedOrder(productIds) {
  await api.put('/admin/products/featured-order', { productIds })
}

export async function uploadProductImage(productId, formData) {
  const res = await api.post(`/admin/products/${productId}/images`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data.data ?? null
}

export async function deleteProductImage(productId, imageId) {
  await api.delete(`/admin/products/${productId}/images/${imageId}`)
}

export async function setPrimaryImage(productId, imageId) {
  await api.put(`/admin/products/${productId}/images/${imageId}/primary`)
}
