import api from './api.js'

export async function getLegalContent() {
  const res = await api.get('/legal')
  return res.data
}
