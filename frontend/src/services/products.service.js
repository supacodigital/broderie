import api from './api.js'

/* Récupère la liste paginée des produits avec filtres */
export function getProducts(params) {
  return api.get('/products', { params }).then(r => r.data)
}

/* Récupère un produit par son slug */
export function getProductBySlug(slug, locale = 'fr') {
  return api.get(`/products/${slug}`, { params: { locale } }).then(r => r.data)
}

/* Recherche full-text */
export function searchProducts(q, params = {}) {
  return api.get('/products/search', { params: { q, ...params } }).then(r => r.data)
}

/* Récupère toutes les catégories */
export function getCategories(locale = 'fr') {
  return api.get('/categories', { params: { locale } }).then(r => r.data)
}
