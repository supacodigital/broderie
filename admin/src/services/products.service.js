import api from './api.js'

// Backend listes: { success, data: [], pagination }
// Backend ressource: { success, data: {} }
export async function getProducts(params = {}) {
  const res = await api.get('/admin/products', { params })
  return { data: res.data.data ?? [], pagination: res.data.pagination ?? {} }
}

export async function getProductById(id) {
  const res = await api.get(`/admin/products/${id}`)
  return res.data.data ?? null
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
