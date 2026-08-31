import api, { setAccessToken } from './api.js'

export async function updateProfile(data) {
  const res = await api.put('/users/me', data)
  return res.data
}

export async function updatePassword(currentPassword, newPassword) {
  const res = await api.put('/users/me/password', { current_password: currentPassword, new_password: newPassword })
  // Le backend réémet un couple de tokens (le changement de mot de passe invalide
  // les refresh tokens antérieurs) — on adopte le nouvel access token.
  const fresh = res.data?.data?.accessToken
  if (fresh) setAccessToken(fresh)
  return res.data
}
