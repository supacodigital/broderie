import api from './api.js'

export function logConsent(type, accepted) {
  return api.post('/consent', { type, accepted, version: '1.0' }).catch(() => {})
}
