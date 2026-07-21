import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, AlertCircle, LogIn } from 'lucide-react'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../../contexts/AuthContext.jsx'
import AuthField from './AuthField.jsx'
import s from './AuthForm.module.css'

function buildSchema(t) {
  return z.object({
    email:    z.string().min(1, t('auth.errors.emailRequired')).email(t('auth.errors.emailInvalid')),
    password: z.string().min(1, t('auth.errors.passwordRequired')).min(8, t('auth.errors.passwordMin')),
  })
}

/* Formulaire de connexion — rendu à l'intérieur d'AuthLayout */
export default function LoginForm() {
  const { t }      = useTranslation()
  const { login, loginGoogle } = useAuth()
  const navigate   = useNavigate()
  const location   = useLocation()

  const [showPwd,      setShowPwd]      = useState(false)
  const [globalError,  setGlobalError]  = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)

  /* Redirige vers la page demandée ou /mon-compte après connexion */
  const from = location.state?.from?.pathname ?? '/mon-compte'

  const { register, handleSubmit, setFocus, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(buildSchema(t)),
  })

  /* Focus programmatique sur le 1er champ en erreur à la soumission (WCAG) */
  const onInvalid = (formErrors) => {
    const first = Object.keys(formErrors)[0]
    if (first) setFocus(first)
  }

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
    <>
      {/* En-tête */}
      <div className={s.header}>
        <h1 className={s.title}>{t('auth.loginTitle')}</h1>
        <p className={s.subtitle}>{t('auth.loginSubtitle')}</p>
      </div>

      {/* Erreur globale */}
      {globalError && (
        <div className={s.globalError} role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          {globalError}
        </div>
      )}

      {/* Légende champs obligatoires */}
      <p className={s.requiredLegend}>
        {t('form.requiredLegend')} <span className={s.requiredMark} aria-hidden="true">*</span> {t('form.requiredMark')}.
      </p>

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate className={s.form}>

        {/* Email */}
        <AuthField id="login-email" name="email" required register={register} t={t}
          label={t('auth.email')} error={errors.email}
          type="email" autoComplete="email" placeholder={t('auth.emailPlaceholder')} />

        {/* Mot de passe */}
        <AuthField id="login-password" name="password" required t={t}
          label={t('auth.password')} error={errors.password}>
          {({ errorId }) => (
            <div className={s.inputWrap}>
              <input
                id="login-password"
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder={t('auth.passwordPlaceholder')}
                className={`${s.input} ${s.withEye} ${errors.password ? s.error : ''}`}
                aria-invalid={errors.password ? 'true' : undefined}
                aria-describedby={errorId}
                {...register('password')}
              />
              <button
                type="button"
                className={s.eyeBtn}
                onClick={() => setShowPwd(p => !p)}
                aria-label={showPwd ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                {showPwd ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          )}
        </AuthField>

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

      {/* Pied — lien mobile vers l'inscription (le panneau gère le desktop) */}
      <p className={s.footer}>
        {t('auth.noAccount')}
        <Link to="/inscription">{t('auth.signUp')}</Link>
      </p>
    </>
  )
}
