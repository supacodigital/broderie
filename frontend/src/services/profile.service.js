import api from './api.js'

export async function updateProfile(data) {
  const res = await api.put('/users/me', data)
  return res.data
}

export async function updatePassword(currentPassword, newPassword) {
  const res = await api.put('/users/me/password', { current_password: currentPassword, new_password: newPassword })
  return res.data
}
