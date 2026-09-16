import api from './api.js'

export function getProducts(params, axiosOptions = {}) {
  return api.get('/products', { params, ...axiosOptions }).then(r => r.data)
}

export function getProductBySlug(slug, locale = 'fr') {
  return api.get(`/products/${slug}`, { params: { locale } }).then(r => r.data)
}

export function searchProducts(q, params = {}, axiosOptions = {}) {
  return api.get('/products', { params: { q, ...params }, ...axiosOptions }).then(r => r.data)
}

/* L'arborescence est demandée par plusieurs composants d'une même page — la barre
   de rayons et le panneau de filtres du catalogue, entre autres — et ne change
   qu'à une modification en administration. Les appels sont donc mutualisés : la
   promesse en cours est partagée, puis le résultat conservé le temps de la
   visite. Deux requêtes identiques par page de catalogue devenaient vite
   coûteuses sur un catalogue parcouru longuement. */
const categoriesCache = new Map()

export function getCategories(locale = 'fr') {
  if (categoriesCache.has(locale)) return categoriesCache.get(locale)

  const requete = api.get('/categories', { params: { locale } })
    .then(r => r.data)
    .catch(err => {
      // Un échec ne doit pas être mémorisé : le prochain appel doit réessayer
      categoriesCache.delete(locale)
      throw err
    })

  categoriesCache.set(locale, requete)
  return requete
}

// Marques / éditeurs présents au catalogue — pour le filtre boutique.
// Renvoie un tableau de chaînes (ex. ['Bothy Threads', 'DMC Art.117', …]).
export function getBrands() {
  return api.get('/products/brands').then(r => r.data?.data ?? [])
}
