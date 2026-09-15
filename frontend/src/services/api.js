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

/* Pages accessibles sans être connecté, atteintes par un lien reçu par email.
   Une session absente y est NORMALE : y forcer une redirection vers /connexion
   détruirait la page avant qu'elle ait fait son travail (cas vécu : le lien de
   confirmation d'email ouvert dans un navigateur sans session validait bien le
   compte côté serveur, mais l'écran de confirmation était remplacé par la page
   de connexion — l'utilisateur croyait l'opération échouée). */
const PUBLIC_PATHS = [
  '/verifier-email',
  '/reinitialiser-mot-de-passe',
  '/mot-de-passe-oublie',
  '/connexion',
  '/inscription',
]

const isOnPublicPath = () =>
  PUBLIC_PATHS.some((path) => window.location.pathname.startsWith(path))

/* Rafraîchit automatiquement le token sur 401 — sauf pour les routes /auth/ */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    const isAuthRoute = original.url?.includes('/auth/')
    if (error.response?.status === 401 && !original._retry && !isAuthRoute) {
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
        /* Sur une page publique, on laisse l'appelant gérer l'erreur */
        if (!isOnPublicPath()) {
          window.location.href = '/connexion'
        }
      }
    }

    return Promise.reject(error)
  },
)

export default api
