import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { login as loginService, logout as logoutService, tryRefreshSilent } from '../services/auth.service.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  /* Renouvellement silencieux au montage */
  useEffect(() => {
    tryRefreshSilent()
      .then(u => setUser(u))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (credentials) => {
    const data = await loginService(credentials)
    const u = data.data?.user ?? null
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    await logoutService()
    setUser(null)
  }, [])

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  return ctx
}
