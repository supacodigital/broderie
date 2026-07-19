import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, KeyRound, Lock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import s from './MfaVerify.module.css'

export default function MfaVerify() {
  const { verifyMfa, verifyMfaRecoveryCode } = useAuth()
  const navigate = useNavigate()

  const [useRecovery,  setUseRecovery]  = useState(false)
  const [code,         setCode]         = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const [error,        setError]        = useState('')
  const inputRef = useRef(null)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (useRecovery) {
        await verifyMfaRecoveryCode(code)
      } else {
        await verifyMfa(code)
      }
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Code invalide ou expiré.')
      setCode('')
      inputRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  const toggleMode = () => {
    setUseRecovery((v) => !v)
    setCode('')
    setError('')
  }

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.iconWrap}>
          <Lock size={22} />
        </div>
        <h1 className={s.title}>Vérification en deux étapes</h1>
        <p className={s.subtitle}>
          {useRecovery
            ? 'Saisissez l\'un de vos codes de récupération'
            : 'Saisissez le code de votre application d\'authentification'}
        </p>

        {error && (
          <div className={s.alert} role="alert">
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className={s.form}>
          <div className={s.field}>
            <label htmlFor="mfa-code" className={s.label}>
              {useRecovery ? 'Code de récupération' : 'Code à 6 chiffres'}
            </label>
            {useRecovery ? (
              <input
                ref={inputRef}
                id="mfa-code"
                type="text"
                autoComplete="off"
                placeholder="XXXX-XXXX"
                className={s.recoveryInput}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoFocus
              />
            ) : (
              <input
                ref={inputRef}
                id="mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                className={s.codeInput}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            )}
          </div>

          <button type="submit" className={s.btn} disabled={submitting || !code}>
            {submitting ? 'Vérification…' : 'Vérifier'}
          </button>
        </form>

        <button type="button" className={s.switchLink} onClick={toggleMode}>
          <KeyRound size={13} />
          {useRecovery ? 'Utiliser mon application d\'authentification' : 'Utiliser un code de récupération'}
        </button>
      </div>
    </div>
  )
}
