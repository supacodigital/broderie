import api from './api.js'

export async function subscribe(email) {
  const res = await api.post('/newsletter/subscribe', { email })
  return res.data
}
