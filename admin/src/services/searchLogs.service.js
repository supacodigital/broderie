import api from './api.js'

/* Recherches restées sans résultat en boutique.
   Aucune donnée personnelle : la table ne contient que des termes et des
   compteurs (voir backend/services/searchLog.service.js). */
export function getNoResultSearches(params = {}) {
  return api.get('/admin/search-logs/no-results', { params }).then(r => r.data)
}
