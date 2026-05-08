import api, { setAccessToken, clearAccessToken } from './api.js'

export async function login(credentials) {
  const res = await api.post('/auth/login', credentials)
  const token = res.data.data?.accessToken ?? res.data.data?.access_token
  if (token) setAccessToken(token)
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
