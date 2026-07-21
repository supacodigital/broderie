import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, AlertCircle, UserPlus } from 'lucide-react'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../../contexts/AuthContext.jsx'
import AuthField from './AuthField.jsx'
import s from './AuthForm.module.css'

function buildSchema(t) {
  return z.object({
    first_name: z.string().min(1, t('auth.errors.firstNameRequired')),
    last_name:  z.string().min(1, t('auth.errors.lastNameRequired')),
    email:      z.string().min(1, t('auth.errors.emailRequired')).email(t('auth.errors.emailInvalid')),
    password:   z.string().min(1, t('auth.errors.passwordRequired')).min(5, t('auth.errors.passwordMin'))
      .regex(/[A-Z]/, t('auth.errors.passwordUppercase'))
      .regex(/[0-9]/, t('auth.errors.passwordDigit'))
      .regex(/[^A-Za-z0-9]/, t('auth.errors.passwordSymbol')),
    password_confirm: z.string(),
    /* Zod 4 : la case CGV doit valoir true — message custom via refine */
    cgv: z.boolean().refine(v => v === true, { message: t('auth.errors.cgvRequired') }),
  }).refine(d => d.password === d.password_confirm, {
    message: t('auth.errors.passwordMatch'),
    path: ['password_confirm'],
  })
}

/* Formulaire d'inscription — rendu à l'intérieur d'AuthLayout */
export default function RegisterForm() {
  const { t }        = useTranslation()
  const { register: authRegister, loginGoogle } = useAuth()
  const navigate     = useNavigate()

  const [showPwd,       setShowPwd]       = useState(false)
  const [showPwd2,      setShowPwd2]      = useState(false)
  const [globalError,   setGlobalError]   = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)

  const { register, handleSubmit, setFocus, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(buildSchema(t)),
    defaultValues: { cgv: false },
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
      navigate('/mon-compte', { replace: true })
    } catch {
      setGlobalError(t('auth.errors.googleFailed'))
    } finally {
      setGoogleLoading(false)
    }
  }

  const onSubmit = async (values) => {
    setGlobalError('')
    const { password_confirm, cgv, first_name, last_name, ...rest } = values
    try {
      await authRegister({ ...rest, firstName: first_name, lastName: last_name })
      navigate('/mon-compte', { replace: true })
    } catch (err) {
      const status = err.response?.status
      if (status === 409) {
        setGlobalError(t('auth.errors.emailTaken'))
      } else {
        setGlobalError(t('auth.errors.generic'))
      }
    }
  }

  return (
    <>
      {/* En-tête */}
      <div className={s.header}>
        <h1 className={s.title}>{t('auth.registerTitle')}</h1>
        <p className={s.subtitle}>{t('auth.registerSubtitle')}</p>
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

        {/* Prénom + Nom */}
        <div className={s.row}>
          <AuthField id="reg-first-name" name="first_name" required register={register} t={t}
            label={t('auth.firstName')} error={errors.first_name}
            type="text" autoComplete="given-name" placeholder={t('auth.firstNamePlaceholder')} />
          <AuthField id="reg-last-name" name="last_name" required register={register} t={t}
            label={t('auth.lastName')} error={errors.last_name}
            type="text" autoComplete="family-name" placeholder={t('auth.lastNamePlaceholder')} />
        </div>

        {/* Email */}
        <AuthField id="reg-email" name="email" required register={register} t={t}
          label={t('auth.email')} error={errors.email}
          type="email" autoComplete="email" placeholder={t('auth.emailPlaceholder')} />

        {/* Mot de passe */}
        <AuthField id="reg-password" name="password" required t={t}
          label={t('auth.password')} error={errors.password}>
          {({ errorId }) => (
            <>
              <div className={s.inputWrap}>
                <input
                  id="reg-password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder={t('auth.passwordPlaceholder')}
                  className={`${s.input} ${s.withEye} ${errors.password ? s.error : ''}`}
                  aria-invalid={errors.password ? 'true' : undefined}
                  aria-describedby={`reg-password-hint${errorId ? ` ${errorId}` : ''}`}
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
              {/* Indication de format — toujours visible pour guider la saisie */}
              <p id="reg-password-hint" className={s.fieldHint}>{t('auth.passwordHint')}</p>
            </>
          )}
        </AuthField>

        {/* Confirmation mot de passe */}
        <AuthField id="reg-password-confirm" name="password_confirm" required t={t}
          label={t('auth.passwordConfirm')} error={errors.password_confirm}>
          {({ errorId }) => (
            <div className={s.inputWrap}>
              <input
                id="reg-password-confirm"
                type={showPwd2 ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t('auth.passwordConfirmPlaceholder')}
                className={`${s.input} ${s.withEye} ${errors.password_confirm ? s.error : ''}`}
                aria-invalid={errors.password_confirm ? 'true' : undefined}
                aria-describedby={errorId}
                {...register('password_confirm')}
              />
              <button
                type="button"
                className={s.eyeBtn}
                onClick={() => setShowPwd2(p => !p)}
                aria-label={showPwd2 ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                {showPwd2 ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          )}
        </AuthField>

        {/* Acceptation CGV */}
        <div className={s.field}>
          <div className={s.cgvRow}>
            <input
              id="reg-cgv"
              type="checkbox"
              className={s.checkbox}
              aria-invalid={errors.cgv ? 'true' : undefined}
              aria-describedby={errors.cgv ? 'reg-cgv-error' : undefined}
              {...register('cgv')}
            />
            <label htmlFor="reg-cgv" className={s.cgvLabel}>
              {t('auth.cgvAccept')}{' '}
              <Link to="/cgv">{t('auth.cgvLink')}</Link>
              <span className={s.requiredMark} aria-hidden="true"> *</span>
            </label>
          </div>
          {errors.cgv && (
            <span id="reg-cgv-error" className={s.fieldError} role="alert">
              <AlertCircle size={12} aria-hidden="true" />{errors.cgv.message}
            </span>
          )}
        </div>

        {/* Bouton inscription */}
        <button type="submit" className={s.submitBtn} disabled={isSubmitting}>
          {isSubmitting ? (
            <>{t('auth.loadingRegister')}</>
          ) : (
            <><UserPlus size={16} />{t('auth.registerCta')}</>
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
          text="signup_with"
          shape="rectangular"
          locale="fr"
        />
      </div>

      {/* Pied — lien mobile vers la connexion (le panneau gère le desktop) */}
      <p className={s.footer}>
        {t('auth.alreadyAccount')}
        <Link to="/connexion">{t('auth.signIn')}</Link>
      </p>
    </>
  )
}
