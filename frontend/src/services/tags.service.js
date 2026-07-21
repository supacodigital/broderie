import api from './api.js'

export function getTags(locale = 'fr') {
  return api.get('/tags', { params: { locale } }).then(r => r.data)
}
