import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import RecoveryCodesModal from './RecoveryCodesModal.jsx'
import s from './MfaSetup.module.css'

export default function MfaSetup() {
  const { initMfaSetup, confirmMfaSetup, finishMfaSetup } = useAuth()
  const navigate = useNavigate()

  const [qrCodeDataUrl,   setQrCodeDataUrl]   = useState(null)
  const [manualEntryKey,  setManualEntryKey]  = useState(null)
  const [loadingQr,       setLoadingQr]       = useState(true)
  const [loadError,       setLoadError]       = useState(false)
  const [code,             setCode]           = useState('')
  const [submitting,       setSubmitting]     = useState(false)
  const [error,            setError]          = useState('')
  const [recoveryCodes,    setRecoveryCodes]  = useState(null)
  const inputRef = useRef(null)

  const loadQrCode = async () => {
    setLoadError(false)
    setLoadingQr(true)
    try {
      const data = await initMfaSetup()
      setQrCodeDataUrl(data.qrCodeDataUrl)
      setManualEntryKey(data.manualEntryKey)
      inputRef.current?.focus()
    } catch {
      setLoadError(true)
    } finally {
      setLoadingQr(false)
    }
  }

  // Garde contre le double montage de React.StrictMode en dev : sans elle, deux appels
  // concurrents à initMfaSetup() régénèrent chacun un secret en base (upsertPendingSecret),
  // et le QR affiché à l'écran peut ne plus correspondre au dernier secret écrit.
  const initRequested = useRef(false)
  useEffect(() => {
    if (initRequested.current) return
    initRequested.current = true
    loadQrCode()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const { recoveryCodes } = await confirmMfaSetup(code)
      setRecoveryCodes(recoveryCodes)
    } catch (err) {
      const status = err?.response?.status
      setError(status === 400 ? 'Code invalide ou expiré.' : 'Une erreur est survenue. Veuillez réessayer.')
      setCode('')
      inputRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  if (recoveryCodes) {
    return (
      <RecoveryCodesModal
        codes={recoveryCodes}
        onContinue={() => {
          finishMfaSetup()
          navigate('/dashboard', { replace: true })
        }}
      />
    )
  }

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.iconWrap}>
          <ShieldCheck size={22} />
        </div>
        <h1 className={s.title}>Configurer la double authentification</h1>
        <p className={s.subtitle}>Obligatoire pour les comptes administrateur</p>

        {loadingQr && <p className={s.loading}>Chargement du QR code…</p>}

        {loadError && (
          <div className={s.alert} role="alert">
            <AlertCircle size={15} />
            Impossible de charger le QR code.{' '}
            <button type="button" className={s.retryLink} onClick={loadQrCode}>Réessayer</button>
          </div>
        )}

        {!loadingQr && !loadError && qrCodeDataUrl && (
          <>
            <p className={s.instructions}>
              Scannez ce code avec une application d'authentification
              (Google Authenticator, Authy, 1Password…)
            </p>

            <img src={qrCodeDataUrl} alt="QR code de configuration MFA" className={s.qrImage} width={200} height={200} />

            <details className={s.manualEntry}>
              <summary>Saisir la clé manuellement</summary>
              <code className={s.manualKey}>{manualEntryKey}</code>
            </details>

            {error && (
              <div className={s.alert} role="alert">
                <AlertCircle size={15} />
                {error}
              </div>
            )}

            <form onSubmit={onSubmit} className={s.form}>
              <div className={s.field}>
                <label htmlFor="mfa-code" className={s.label}>Code à 6 chiffres</label>
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
              </div>
              <button type="submit" className={s.btn} disabled={submitting || code.length !== 6}>
                {submitting ? 'Vérification…' : 'Activer la double authentification'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
