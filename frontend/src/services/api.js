import axios from 'axios'

/* Token d'accès en mémoire — jamais en localStorage (sécurité XSS) */
let accessToken = null

export function setAccessToken(token) {
  accessToken = token
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`
}
export function clearAccessToken() {
  accessToken = null
  delete api.defaults.headers.common['Authorization']
}
export function getAccessToken() { return accessToken }

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 8000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

/* Rafraîchit automatiquement le token sur 401 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const { data } = await axios.post(
          '/api/v1/auth/refresh-token',
          {},
          { withCredentials: true },
        )
        const newToken = data.data?.accessToken ?? data.data?.access_token
        if (newToken) {
          setAccessToken(newToken)
          return api(original)
        }
      } catch {
        clearAccessToken()
        window.location.href = '/connexion'
      }
    }

    return Promise.reject(error)
  },
)

export default api
