import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  login as loginService, logout as logoutService, tryRefreshSilent,
  mfaSetupInit, mfaSetupConfirm, mfaVerify, mfaVerifyRecoveryCode,
} from '../services/auth.service.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,       setUser]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  /* { token, mode: 'setup' | 'verify' } tant que le second facteur n'est pas validé —
     user reste null jusque-là, jamais posé prématurément */
  const [mfaPending, setMfaPending] = useState(null)

  /* Renouvellement silencieux au montage */
  useEffect(() => {
    tryRefreshSilent()
      .then(u => setUser(u))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (credentials) => {
    const data = await loginService(credentials)

    if (data.data?.mfaRequired) {
      setMfaPending({ token: data.data.mfaPendingToken, mode: data.data.mfaRequired })
      return { mfaRequired: data.data.mfaRequired }
    }

    const u = data.data?.user ?? null
    setUser(u)
    return u
  }, [])

  const initMfaSetup = useCallback(async () => {
    if (!mfaPending) throw new Error('Aucune session MFA en attente.')
    const data = await mfaSetupInit(mfaPending.token)
    return data.data
  }, [mfaPending])

  const confirmMfaSetup = useCallback(async (code) => {
    if (!mfaPending) throw new Error('Aucune session MFA en attente.')
    const data = await mfaSetupConfirm(mfaPending.token, code)
    /* mfaPending N'EST PAS vidé ici — MfaRoute (App.jsx) redirigerait immédiatement
       vers /connexion dès qu'il devient null, avant que la modale des recovery codes
       ait pu s'afficher. Voir finishMfaSetup(), appelé seulement après que
       l'utilisateur a fermé cette modale. */
    setUser(data.data?.user ?? null)
    return { user: data.data?.user, recoveryCodes: data.data?.recoveryCodes }
  }, [mfaPending])

  /* Appelé une fois la modale des recovery codes fermée (bouton "Continuer") —
     termine réellement le flux de setup, MfaRoute laisse alors place à PrivateRoute */
  const finishMfaSetup = useCallback(() => {
    setMfaPending(null)
  }, [])

  const verifyMfa = useCallback(async (code) => {
    if (!mfaPending) throw new Error('Aucune session MFA en attente.')
    const data = await mfaVerify(mfaPending.token, code)
    setUser(data.data?.user ?? null)
    setMfaPending(null)
    return data.data?.user
  }, [mfaPending])

  const verifyMfaRecoveryCode = useCallback(async (recoveryCode) => {
    if (!mfaPending) throw new Error('Aucune session MFA en attente.')
    const data = await mfaVerifyRecoveryCode(mfaPending.token, recoveryCode)
    setUser(data.data?.user ?? null)
    setMfaPending(null)
    return data.data?.user
  }, [mfaPending])

  const logout = useCallback(async () => {
    await logoutService()
    setUser(null)
    setMfaPending(null)
  }, [])

  const isAdmin = user?.role === 'admin'

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout, isAdmin,
      mfaPending, initMfaSetup, confirmMfaSetup, finishMfaSetup, verifyMfa, verifyMfaRecoveryCode,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  return ctx
}
