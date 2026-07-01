import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MailWarning, Check } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext.jsx'
import { resendVerification } from '../../../services/auth.service.js'
import s from './EmailVerificationBanner.module.css'

/* Bandeau non bloquant invitant à confirmer l'adresse email.
   Affiché uniquement quand l'utilisateur est connecté et non vérifié. */
export default function EmailVerificationBanner() {
  const { t } = useTranslation()
  const { user, isAuthenticated } = useAuth()
  const [status, setStatus] = useState('idle') // idle | sending | sent

  /* Rien à afficher si non connecté ou email déjà vérifié */
  if (!isAuthenticated || !user || user.emailVerified) return null

  const handleResend = async () => {
    if (status === 'sending') return
    setStatus('sending')
    try {
      await resendVerification()
      setStatus('sent')
    } catch {
      /* Échec silencieux — on réautorise un nouvel essai */
      setStatus('idle')
    }
  }

  return (
    <div className={s.banner} role="status">
      <MailWarning size={16} className={s.icon} aria-hidden="true" />
      <span className={s.text}>{t('emailVerify.bannerText')}</span>
      {status === 'sent' ? (
        <span className={s.sent}>
          <Check size={14} aria-hidden="true" />{t('emailVerify.bannerSent')}
        </span>
      ) : (
        <button
          type="button"
          className={s.resendBtn}
          onClick={handleResend}
          disabled={status === 'sending'}
        >
          {status === 'sending' ? t('emailVerify.bannerSending') : t('emailVerify.bannerResend')}
        </button>
      )}
    </div>
  )
}
