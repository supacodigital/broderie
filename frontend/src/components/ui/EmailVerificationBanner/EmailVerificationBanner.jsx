import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MailWarning, Check } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext.jsx'
import { resendVerification } from '../../../services/auth.service.js'
import s from './EmailVerificationBanner.module.css'

/* Barre d'alerte invitant à confirmer l'adresse email.
   Ancrée en bas de l'écran (position fixe) : elle ne défile pas avec le contenu
   et reste donc visible sur toutes les pages. Non masquable — elle disparaît
   uniquement une fois l'adresse confirmée. Non bloquante : la navigation et
   l'achat restent possibles. */
export default function EmailVerificationBanner() {
  const { t } = useTranslation()
  const { user, isAuthenticated, refreshUser } = useAuth()
  const { pathname } = useLocation()
  const [status, setStatus] = useState('idle') // idle | sending | sent
  const bannerRef = useRef(null)

  const isVisible = isAuthenticated && !!user && !user.emailVerified

  /* Le lien de confirmation est souvent ouvert ailleurs (autre onglet, téléphone) :
     cet onglet-ci garderait alors un statut périmé et la barre resterait affichée
     jusqu'au prochain rechargement. On revérifie donc le statut au changement de
     page et au retour sur l'onglet.
     Ne s'exécute que tant que la barre est visible : une fois l'adresse confirmée,
     `isVisible` passe à false et plus aucune requête n'est émise. */
  useEffect(() => {
    if (!isVisible) return

    refreshUser()

    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshUser()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    /* pathname en dépendance : une navigation relance la vérification */
  }, [isVisible, pathname, refreshUser])

  /* Publie la hauteur réelle de la barre dans --email-banner-height :
     le footer et les boutons flottants s'en servent pour se décaler et ne pas
     passer dessous. La hauteur varie (texte sur 2 lignes en mobile), d'où le
     ResizeObserver plutôt qu'une valeur figée. */
  useEffect(() => {
    const root = document.documentElement
    if (!isVisible) {
      root.style.removeProperty('--email-banner-height')
      return
    }

    const el = bannerRef.current
    if (!el) return

    const publishHeight = () => {
      root.style.setProperty('--email-banner-height', `${el.offsetHeight}px`)
    }
    publishHeight()

    const observer = new ResizeObserver(publishHeight)
    observer.observe(el)

    return () => {
      observer.disconnect()
      root.style.removeProperty('--email-banner-height')
    }
  }, [isVisible])

  /* Rien à afficher si non connecté ou email déjà vérifié */
  if (!isVisible) return null

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
    <div className={s.banner} role="status" ref={bannerRef}>
      <div className={s.inner}>
        <span className={s.iconWrap} aria-hidden="true">
          <MailWarning size={18} />
        </span>

        <p className={s.message}>
          <strong className={s.title}>{t('emailVerify.bannerTitle')}</strong>
          <span className={s.text}>
            {t('emailVerify.bannerText', { email: user.email })}
          </span>
        </p>

        {status === 'sent' ? (
          <span className={s.sent}>
            <Check size={15} aria-hidden="true" />{t('emailVerify.bannerSent')}
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
    </div>
  )
}
