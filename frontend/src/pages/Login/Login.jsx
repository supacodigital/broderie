import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, AlertCircle, LogIn } from 'lucide-react'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../../contexts/AuthContext.jsx'
import s from './Login.module.css'

function buildSchema(t) {
  return z.object({
    email:    z.string().min(1, t('auth.errors.emailRequired')).email(t('auth.errors.emailInvalid')),
    password: z.string().min(1, t('auth.errors.passwordRequired')).min(8, t('auth.errors.passwordMin')),
  })
}

export default function Login() {
  const { t }      = useTranslation()
  const { login, loginGoogle } = useAuth()
  const navigate   = useNavigate()
  const location   = useLocation()

  const [showPwd,      setShowPwd]      = useState(false)
  const [globalError,  setGlobalError]  = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)

  /* Redirige vers la page demandée ou /mon-compte après connexion */
  const from = location.state?.from?.pathname ?? '/mon-compte'

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(buildSchema(t)),
  })

  const handleGoogleLogin = async ({ credential }) => {
    if (!credential) return
    setGlobalError('')
    setGoogleLoading(true)
    try {
      await loginGoogle(credential)
      navigate(from, { replace: true })
    } catch {
      setGlobalError(t('auth.errors.googleFailed'))
    } finally {
      setGoogleLoading(false)
    }
  }

  const onSubmit = async (values) => {
    setGlobalError('')
    try {
      await login(values)
      navigate(from, { replace: true })
    } catch (err) {
      const status = err.response?.status
      if (status === 401) {
        setGlobalError(t('auth.errors.invalidCredentials'))
      } else {
        setGlobalError(t('auth.errors.generic'))
      }
    }
  }

  return (
    <div className={s.page}>
      <div className={s.card}>

        {/* En-tête */}
        <div className={s.header}>
          <Link to="/" className={s.logo}>✦ Au Point-Compté</Link>
          <h1 className={s.title}>{t('auth.loginTitle')}</h1>
          <p className={s.subtitle}>{t('auth.loginSubtitle')}</p>
        </div>

        {/* Erreur globale */}
        {globalError && (
          <div className={s.globalError} role="alert">
            <AlertCircle size={16} />
            {globalError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className={s.form}>

          {/* Email */}
          <div className={s.field}>
            <label htmlFor="login-email" className={s.label}>{t('auth.email')}</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder={t('auth.emailPlaceholder')}
              className={`${s.input} ${errors.email ? s.error : ''}`}
              {...register('email')}
            />
            {errors.email && (
              <span className={s.fieldError}><AlertCircle size={12} />{errors.email.message}</span>
            )}
          </div>

          {/* Mot de passe */}
          <div className={s.field}>
            <label htmlFor="login-password" className={s.label}>{t('auth.password')}</label>
            <div className={s.inputWrap}>
              <input
                id="login-password"
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder={t('auth.passwordPlaceholder')}
                className={`${s.input} ${s.withEye} ${errors.password ? s.error : ''}`}
                {...register('password')}
              />
              <button
                type="button"
                className={s.eyeBtn}
                onClick={() => setShowPwd(p => !p)}
                aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && (
              <span className={s.fieldError}><AlertCircle size={12} />{errors.password.message}</span>
            )}
          </div>

          {/* Mot de passe oublié */}
          <div className={s.forgotRow}>
            <Link to="/mot-de-passe-oublie" className={s.forgotLink}>
              {t('auth.forgotPassword')}
            </Link>
          </div>

          {/* Bouton connexion */}
          <button type="submit" className={s.submitBtn} disabled={isSubmitting}>
            {isSubmitting ? (
              <>{t('auth.loading')}</>
            ) : (
              <><LogIn size={16} />{t('auth.loginCta')}</>
            )}
          </button>

        </form>

        {/* Séparateur Google */}
        <div className={s.divider}>
          <span className={s.dividerLine} />
          <span className={s.dividerText}>{t('auth.orContinueWith')}</span>
          <span className={s.dividerLine} />
        </div>

        {/* Bouton Google */}
        <div className={`${s.googleWrap} ${googleLoading ? s.googleLoading : ''}`}>
          <GoogleLogin
            onSuccess={handleGoogleLogin}
            onError={() => setGlobalError(t('auth.errors.googleFailed'))}
            width="360"
            text="signin_with"
            shape="rectangular"
            locale="fr"
          />
        </div>

        {/* Pied */}
        <p className={s.footer}>
          {t('auth.noAccount')}
          <Link to="/inscription">{t('auth.signUp')}</Link>
        </p>

      </div>
    </div>
  )
}
