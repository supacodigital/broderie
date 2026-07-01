import { useEffect, useState, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle, XCircle, Loader } from 'lucide-react'
import { verifyEmail } from '../../services/auth.service.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import s from './VerifyEmail.module.css'

/* Page de confirmation d'adresse email — atterrissage du lien reçu par email */
export default function VerifyEmail() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const { refreshUser } = useAuth()
  const token = searchParams.get('token') || ''

  const [state, setState] = useState('loading') // loading | success | error
  const ranRef = useRef(false)

  useEffect(() => {
    /* Garde-fou : n'exécute la vérification qu'une seule fois (StrictMode) */
    if (ranRef.current) return
    ranRef.current = true

    if (!token) { setState('error'); return }

    verifyEmail(token)
      .then(() => {
        setState('success')
        /* Rafraîchit l'utilisateur si connecté → masque le bandeau */
        refreshUser()
      })
      .catch(() => setState('error'))
  }, [token, refreshUser])

  return (
    <div className={s.page}>
      <div className={s.card}>
        {state === 'loading' && (
          <>
            <div className={s.stateIcon} data-type="loading">
              <Loader size={40} className={s.spin} />
            </div>
            <h1 className={s.title}>{t('emailVerify.loadingTitle')}</h1>
            <p className={s.desc}>{t('emailVerify.loadingDesc')}</p>
          </>
        )}

        {state === 'success' && (
          <>
            <div className={s.stateIcon} data-type="success">
              <CheckCircle size={40} />
            </div>
            <h1 className={s.title}>{t('emailVerify.successTitle')}</h1>
            <p className={s.desc}>{t('emailVerify.successDesc')}</p>
            <Link to="/mon-compte" className={s.ctaBtn}>{t('emailVerify.successCta')}</Link>
          </>
        )}

        {state === 'error' && (
          <>
            <div className={s.stateIcon} data-type="error">
              <XCircle size={40} />
            </div>
            <h1 className={s.title}>{t('emailVerify.errorTitle')}</h1>
            <p className={s.desc}>{t('emailVerify.errorDesc')}</p>
            <Link to="/mon-compte" className={s.ctaBtn}>{t('emailVerify.errorCta')}</Link>
          </>
        )}
      </div>
    </div>
  )
}
