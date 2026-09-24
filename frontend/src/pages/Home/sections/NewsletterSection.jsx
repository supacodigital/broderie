import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { subscribe } from '../../../services/newsletter.service.js'
import s from './NewsletterSection.module.css'

export default function NewsletterSection() {
  const { t } = useTranslation()
  const [email,     setEmail]     = useState('')
  const [status,    setStatus]    = useState('idle') /* idle | loading | success | error */
  const [errorMsg,  setErrorMsg]  = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email) return
    setStatus('loading')
    try {
      await subscribe(email)
      setStatus('success')
      setEmail('')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.response?.data?.message ?? t('errors.network'))
    }
  }

  return (
    <section className={s.section} aria-label="Inscription à la newsletter">
      <h2 className={s.title}>{t('newsletter.title')}</h2>
      {/* Pas de promesse de contenu sous le titre (CLI-10) : « nouvelles collections,
          tutoriels exclusifs et offres réservées aux abonnées » ne correspondait à
          rien d'annoncé par la boutique, et restait affiché après l'inscription. */}

      {status === 'success' ? (
        <p className={s.successMsg} role="status">{t('newsletter.success')}</p>
      ) : (
        <form className={s.form} onSubmit={handleSubmit} noValidate>
          <label htmlFor="newsletter-email" className={s.srOnly}>
            {t('newsletter.label')}
          </label>
          <input
            id="newsletter-email"
            type="email"
            className={s.input}
            placeholder={t('newsletter.placeholder')}
            autoComplete="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setStatus('idle') }}
            disabled={status === 'loading'}
            aria-describedby={status === 'error' ? 'newsletter-error newsletter-consent' : 'newsletter-consent'}
          />
          <button
            type="submit"
            className={s.btn}
            disabled={status === 'loading' || !email}
          >
            {status === 'loading' ? '…' : t('newsletter.cta')}
          </button>
        </form>
      )}

      {status === 'error' && (
        <p id="newsletter-error" className={s.errorMsg} role="alert">{errorMsg}</p>
      )}

      {/* Information au moment de la collecte (nLPD / RGPD, CLI-05) : double
          opt-in, désinscription, et où lire l'usage fait de l'adresse. */}
      {status !== 'success' && (
        <p id="newsletter-consent" className={s.consent}>
          {t('newsletter.consent')}{' '}
          <Link to="/mentions-legales#donnees" className={s.consentLink}>{t('newsletter.privacyLink')}</Link>
        </p>
      )}
    </section>
  )
}
