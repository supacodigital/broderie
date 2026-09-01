import api, { setAccessToken, clearAccessToken } from './api.js'

export async function updateProfile(data) {
  const res = await api.put('/users/me', data)
  return res.data
}

/* Télécharge l'export JSON de toutes les données personnelles (LPD art. 25) */
export async function downloadMyData() {
  const res = await api.get('/users/me/export', { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  const date = new Date().toISOString().slice(0, 10)
  a.download = `mes-donnees-au-point-compte-${date}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/* Supprime / anonymise le compte (LPD art. 32). `credential` = mot de passe
   (compte classique) ou la chaîne "SUPPRIMER" (compte Google). */
export async function deleteMyAccount({ password, confirm } = {}) {
  await api.delete('/users/me', { data: { password, confirm } })
  clearAccessToken()
}

export async function updatePassword(currentPassword, newPassword) {
  const res = await api.put('/users/me/password', { current_password: currentPassword, new_password: newPassword })
  // Le backend réémet un couple de tokens (le changement de mot de passe invalide
  // les refresh tokens antérieurs) — on adopte le nouvel access token.
  const fresh = res.data?.data?.accessToken
  if (fresh) setAccessToken(fresh)
  return res.data
}
