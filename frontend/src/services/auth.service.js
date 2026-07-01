import api, { setAccessToken, clearAccessToken } from './api.js'

export async function register(data) {
  const res = await api.post('/auth/register', data)
  const token = res.data.data?.accessToken ?? res.data.data?.access_token
  if (token) setAccessToken(token)
  return res.data
}

export async function login(credentials) {
  const res = await api.post('/auth/login', credentials)
  const token = res.data.data?.accessToken ?? res.data.data?.access_token
  if (token) setAccessToken(token)
  return res.data
}

export async function logout() {
  try {
    await api.post('/auth/logout')
  } finally {
    clearAccessToken()
  }
}

export async function forgotPassword(email) {
  const res = await api.post('/auth/forgot-password', { email })
  return res.data
}

export async function resetPassword(token, password) {
  const res = await api.post('/auth/reset-password', { token, password })
  return res.data
}

export async function loginWithGoogle(idToken) {
  const res = await api.post('/auth/google/verify', { idToken })
  const token = res.data.data?.accessToken ?? res.data.data?.access_token
  if (token) setAccessToken(token)
  return res.data
}

export async function getMe() {
  const res = await api.get('/users/me')
  return res.data
}

/* Confirme l'adresse email via le token reçu par email */
export async function verifyEmail(token) {
  const res = await api.get('/auth/verify-email', { params: { token } })
  return res.data
}

/* Renvoie un email de vérification (utilisateur connecté) */
export async function resendVerification() {
  const res = await api.post('/auth/resend-verification')
  return res.data
}
