import { useEffect, useState, useCallback } from 'react'
import { AlertCircle, ShieldCheck, RefreshCw, KeyRound } from 'lucide-react'
import ErrorBanner from '../../components/ui/ErrorBanner/ErrorBanner.jsx'
import SettingsSection, { SaveFeedback } from '../../components/ui/SettingsSection/SettingsSection.jsx'
import RecoveryCodesModal from '../Mfa/RecoveryCodesModal.jsx'
import { mfaGetStatus, mfaRegenerateRecoveryCodes, updatePassword } from '../../services/auth.service.js'
import s from './Settings.module.css'

/* Mot de passe et double authentification du compte connecté. Affiché dans
   Paramètres → Sécurité (administrateur) et dans « Mon compte »
   (super-administrateur, qui n'a pas accès aux Paramètres de la boutique). */

/* ── Changement de mot de passe ── */
function PasswordSection() {
  const [values,  setValues]  = useState({ current: '', next: '', confirm: '' })
  const [saving,  setSaving]  = useState(false)
  const [status,  setStatus]  = useState(null) // null | 'saved' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  const handleChange = (key, val) => setValues(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    setErrorMsg('')
    setStatus(null)

    if (!values.current || !values.next) {
      setErrorMsg('Mot de passe actuel et nouveau mot de passe requis.')
      return
    }
    if (values.next !== values.confirm) {
      setErrorMsg('Les mots de passe ne correspondent pas.')
      return
    }
    if (values.next.length < 12 || !/[A-Z]/.test(values.next) || !/[^A-Za-z0-9]/.test(values.next)) {
      setErrorMsg('Le nouveau mot de passe doit contenir au moins 12 caractères, une majuscule et un symbole.')
      return
    }

    setSaving(true)
    try {
      await updatePassword(values.current, values.next)
      setValues({ current: '', next: '', confirm: '' })
      setStatus('saved')
    } catch (err) {
      setErrorMsg(err.response?.status === 401
        ? 'Mot de passe actuel incorrect.'
        : 'Une erreur est survenue. Veuillez réessayer.')
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsSection
      title="Mot de passe"
      desc="Modifiez le mot de passe de votre compte administrateur."
    >
      {errorMsg && (
        <div className={s.taxNote}>
          <AlertCircle size={13} />
          {errorMsg}
        </div>
      )}
      <div className={s.formRow}>
        <div className={s.field}>
          <label className={s.label}>Mot de passe actuel</label>
          <input
            type="password"
            autoComplete="current-password"
            className={s.input}
            value={values.current}
            onChange={e => handleChange('current', e.target.value)}
          />
        </div>
        <div className={s.field}>
          <label className={s.label}>Nouveau mot de passe</label>
          <input
            type="password"
            autoComplete="new-password"
            className={s.input}
            value={values.next}
            onChange={e => handleChange('next', e.target.value)}
          />
          <p className={s.hint}>Au moins 12 caractères, une majuscule et un symbole.</p>
        </div>
        <div className={s.field}>
          <label className={s.label}>Confirmer le nouveau mot de passe</label>
          <input
            type="password"
            autoComplete="new-password"
            className={s.input}
            value={values.confirm}
            onChange={e => handleChange('confirm', e.target.value)}
          />
        </div>
      </div>
      <div className={s.formActions}>
        <SaveFeedback status={status} />
        <button className={s.btnSave} onClick={handleSave} disabled={saving}>
          <KeyRound size={14} />
          {saving ? 'Enregistrement…' : 'Modifier le mot de passe'}
        </button>
      </div>
    </SettingsSection>
  )
}

/* ── Onglet Sécurité (MFA) ── */
export default function SecurityTab() {
  const [status,        setStatus]        = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(false)
  const [regenerating,  setRegenerating]  = useState(false)
  const [regenError,    setRegenError]    = useState(false)
  const [newCodes,      setNewCodes]      = useState(null)

  const load = useCallback(async () => {
    setError(false)
    setLoading(true)
    try {
      const res = await mfaGetStatus()
      setStatus(res.data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleRegenerate = async () => {
    setRegenerating(true)
    setRegenError(false)
    try {
      const res = await mfaRegenerateRecoveryCodes()
      setNewCodes(res.data.recoveryCodes)
    } catch {
      setRegenError(true)
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <>
    <PasswordSection />
    <SettingsSection
      title="Double authentification"
      desc="La double authentification (MFA) est obligatoire pour tous les comptes administrateur."
    >
      {error && <ErrorBanner onRetry={load} />}
      {loading ? (
        <div className={s.skeletonRow}>
          {[1, 2].map(i => <div key={i} className={s.skeleton} />)}
        </div>
      ) : (
        <>
          <div className={s.mfaStatusRow}>
            <ShieldCheck size={18} className={status?.enabled ? s.mfaEnabledIcon : s.mfaDisabledIcon} />
            <div>
              <p className={s.mfaStatusLabel}>
                {status?.enabled ? 'Double authentification activée' : 'Non activée'}
              </p>
              {status?.enabled && (
                <p className={s.hint}>
                  {status.recoveryCodesRemaining} code{status.recoveryCodesRemaining !== 1 ? 's' : ''} de récupération restant{status.recoveryCodesRemaining !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>

          {status?.enabled && (
            <>
              {regenError && (
                <div className={s.taxNote}>
                  <AlertCircle size={13} />
                  Impossible de régénérer les codes. Veuillez réessayer.
                </div>
              )}
              <div className={s.formActions}>
                <button className={s.btnSave} onClick={handleRegenerate} disabled={regenerating}>
                  <RefreshCw size={14} />
                  {regenerating ? 'Génération…' : 'Régénérer mes codes de récupération'}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {newCodes && (
        <RecoveryCodesModal codes={newCodes} onContinue={() => { setNewCodes(null); load() }} />
      )}
    </SettingsSection>
    </>
  )
}
