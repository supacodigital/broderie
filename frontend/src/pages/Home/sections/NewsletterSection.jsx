import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../../services/api.js'
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
      await api.post('/newsletter/subscribe', { email })
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
      <p className={s.desc}>{t('newsletter.desc')}</p>

      {status === 'success' ? (
        <p className={s.successMsg}>✓ Merci ! Vous êtes maintenant abonnée.</p>
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
            aria-describedby={status === 'error' ? 'newsletter-error' : undefined}
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
    </section>
  )
}
