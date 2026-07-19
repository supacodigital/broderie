import api, { setAccessToken, clearAccessToken } from './api.js'

export async function login(credentials) {
  const res = await api.post('/auth/login', credentials)
  const token = res.data.data?.accessToken ?? res.data.data?.access_token
  /* Si mfaRequired est présent, aucun token final n'est encore émis — ne pas
     appeler setAccessToken (voir AuthContext.jsx pour la suite du flux) */
  if (token) setAccessToken(token)
  return res.data
}

/* Les 4 fonctions MFA passent leur propre header Authorization (le mfaPendingToken),
   jamais celui par défaut d'axios qui porte l'access token d'une session déjà établie */
export async function mfaSetupInit(mfaPendingToken) {
  const res = await api.post('/mfa/setup/init', {}, { headers: { Authorization: `Bearer ${mfaPendingToken}` } })
  return res.data
}

export async function mfaSetupConfirm(mfaPendingToken, code) {
  const res = await api.post('/mfa/setup/confirm', { code }, { headers: { Authorization: `Bearer ${mfaPendingToken}` } })
  const token = res.data.data?.accessToken
  if (token) setAccessToken(token)
  return res.data
}

export async function mfaVerify(mfaPendingToken, code) {
  const res = await api.post('/mfa/verify', { code }, { headers: { Authorization: `Bearer ${mfaPendingToken}` } })
  const token = res.data.data?.accessToken
  if (token) setAccessToken(token)
  return res.data
}

export async function mfaVerifyRecoveryCode(mfaPendingToken, recoveryCode) {
  const res = await api.post('/mfa/verify-recovery-code', { recoveryCode }, { headers: { Authorization: `Bearer ${mfaPendingToken}` } })
  const token = res.data.data?.accessToken
  if (token) setAccessToken(token)
  return res.data
}

export async function mfaGetStatus() {
  const res = await api.get('/mfa/status')
  return res.data
}

export async function mfaRegenerateRecoveryCodes() {
  const res = await api.post('/mfa/recovery-codes/regenerate')
  return res.data
}

export async function logout() {
  try { await api.post('/auth/logout') } finally { clearAccessToken() }
}

export async function getMe() {
  const res = await api.get('/users/me')
  return res.data
}

export async function tryRefreshSilent() {
  try {
    const res = await api.post('/auth/refresh-token')
    const token = res.data.data?.accessToken ?? res.data.data?.access_token
    if (token) setAccessToken(token)
    return res.data.data?.user ?? null
  } catch {
    return null
  }
}
