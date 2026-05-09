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
        window.location.href = '/admin/connexion'
      }
    }
    return Promise.reject(error)
  },
)

export default api
