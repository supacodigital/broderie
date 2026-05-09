import api from './api.js'

export async function getAddresses() {
  const res = await api.get('/users/me/addresses')
  return res.data
}

export async function createAddress(data) {
  const res = await api.post('/users/me/addresses', data)
  return res.data
}

export async function updateAddress(id, data) {
  const res = await api.put(`/users/me/addresses/${id}`, data)
  return res.data
}

export async function deleteAddress(id) {
  const res = await api.delete(`/users/me/addresses/${id}`)
  return res.data
}
