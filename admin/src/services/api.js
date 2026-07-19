import axios from 'axios'

/* Access token stocké en mémoire — jamais en localStorage */
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
  withCredentials: true,
  timeout: 8000,
})

/* Renouvellement silencieux du token sur 401 */
api.interceptors.response.use(
  res => res,
  async error => {
    const original = error.config
    /* Ne pas intercepter les appels vers refresh-token eux-mêmes (évite la boucle infinie) */
    if (original.url?.includes('/auth/refresh-token')) return Promise.reject(error)
    if (original.url?.includes('/auth/login'))          return Promise.reject(error)
    /* MFA pending n'a pas de session à rafraîchir — aucun cookie refresh tant que le
       second facteur n'est pas validé (voir auth.service.js côté backend) */
    if (original.url?.includes('/mfa/'))                return Promise.reject(error)

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const res = await axios.post('/api/v1/auth/refresh-token', {}, { withCredentials: true })
        const newToken = res.data.data?.accessToken ?? res.data.data?.access_token
        if (newToken) {
          setAccessToken(newToken)
          return api(original)
        }
      } catch {
        clearAccessToken()
        /* Rediriger seulement si on n'est pas déjà sur la page de connexion */
        if (!window.location.pathname.includes('/connexion')) {
          window.location.href = '/admin/connexion'
        }
      }
    }
    return Promise.reject(error)
  },
)

export default api
