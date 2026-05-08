import axios from 'axios'

/* Token d'accès en mémoire — jamais en localStorage (sécurité XSS) */
let accessToken = null

export function setAccessToken(token) { accessToken = token }
export function clearAccessToken()    { accessToken = null  }
export function getAccessToken()      { return accessToken  }

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  timeout: 8000,
  withCredentials: true, /* Envoie le cookie refresh token httpOnly */
  headers: { 'Content-Type': 'application/json' },
})

/* Injecte le Bearer token sur chaque requête */
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

/* Rafraîchit automatiquement le token si 401 — uniquement si on avait un token actif */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    /* Ne tente le refresh que si on avait un token (requête authentifiée) */
    if (error.response?.status === 401 && !original._retry && accessToken) {
      original._retry = true
      try {
        const { data } = await axios.post(
          `${import.meta.env.VITE_API_URL ?? '/api/v1'}/auth/refresh-token`,
          {},
          { withCredentials: true },
        )
        setAccessToken(data.data.accessToken)
        original.headers.Authorization = `Bearer ${data.data.accessToken}`
        return api(original)
      } catch {
        clearAccessToken()
        /* Redirige vers /connexion uniquement si la session a expiré */
        window.location.href = '/connexion'
      }
    }

    return Promise.reject(error)
  },
)

export default api
