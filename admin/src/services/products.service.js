import api from './api.js'

export async function getProducts(params = {}) {
  const res = await api.get('/admin/products', { params })
  return res.data
}

export async function getProductById(id) {
  const res = await api.get(`/admin/products/${id}`)
  return res.data
}

export async function createProduct(data) {
  const res = await api.post('/admin/products', data)
  return res.data
}

export async function updateProduct(id, data) {
  const res = await api.put(`/admin/products/${id}`, data)
  return res.data
}

export async function deleteProduct(id) {
  const res = await api.delete(`/admin/products/${id}`)
  return res.data
}

export async function uploadProductImage(productId, formData) {
  const res = await api.post(`/admin/products/${productId}/images`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function deleteProductImage(productId, imageId) {
  const res = await api.delete(`/admin/products/${productId}/images/${imageId}`)
  return res.data
}

export async function setPrimaryImage(productId, imageId) {
  const res = await api.put(`/admin/products/${productId}/images/${imageId}/primary`)
  return res.data
}
