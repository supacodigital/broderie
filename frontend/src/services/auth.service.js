import api, { setAccessToken, clearAccessToken } from './api.js'

/* Inscription */
export async function register(data) {
  const res = await api.post('/auth/register', data)
  const token = res.data.data?.accessToken ?? res.data.data?.access_token
  if (token) setAccessToken(token)
  return res.data
}

/* Connexion */
export async function login(credentials) {
  const res = await api.post('/auth/login', credentials)
  const token = res.data.data?.accessToken ?? res.data.data?.access_token
  if (token) setAccessToken(token)
  return res.data
}

/* Déconnexion */
export async function logout() {
  try {
    await api.post('/auth/logout')
  } finally {
    clearAccessToken()
  }
}

/* Récupérer l'utilisateur courant */
export async function getMe() {
  const res = await api.get('/users/me')
  return res.data
}
