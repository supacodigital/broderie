import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { login as apiLogin, logout as apiLogout, register as apiRegister, getMe } from '../services/auth.service.js'
import { setAccessToken, clearAccessToken } from '../services/api.js'

const AuthContext = createContext(null)

/* Tente un refresh silencieux au chargement de l'app */
async function tryRefreshSilent() {
  try {
    const res = await fetch(
      `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'}/auth/refresh-token`,
      { method: 'POST', credentials: 'include' },
    )
    if (!res.ok) return null
    const json = await res.json()
    const token = json.data?.access_token ?? json.data?.accessToken ?? null
    if (token) setAccessToken(token)
    return token
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true) /* true pendant la restauration de session */
  const initialized = useRef(false)

  /* Restauration de session au montage */
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    tryRefreshSilent().then(async (token) => {
      if (token) {
        try {
          const data = await getMe()
          setUser(data.data)
        } catch {
          clearAccessToken()
        }
      }
      setLoading(false)
    })
  }, [])

  const login = useCallback(async (credentials) => {
    const data = await apiLogin(credentials)
    setUser(data.data?.user ?? null)
    return data
  }, [])

  const register = useCallback(async (payload) => {
    const data = await apiRegister(payload)
    setUser(data.data?.user ?? null)
    return data
  }, [])

  const logout = useCallback(async () => {
    await apiLogout()
    setUser(null)
  }, [])

  const value = { user, loading, login, register, logout, isAuthenticated: !!user }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/* Hook d'accès rapide */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  return ctx
}
