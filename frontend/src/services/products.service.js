import api from './api.js'

export function getProducts(params, axiosOptions = {}) {
  return api.get('/products', { params, ...axiosOptions }).then(r => r.data)
}

export function getProductBySlug(slug, locale = 'fr') {
  return api.get(`/products/${slug}`, { params: { locale } }).then(r => r.data)
}

export function searchProducts(q, params = {}) {
  return api.get('/products', { params: { q, ...params } }).then(r => r.data)
}

export function getCategories(locale = 'fr') {
  return api.get('/categories', { params: { locale } }).then(r => r.data)
}
