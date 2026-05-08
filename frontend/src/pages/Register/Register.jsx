import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, AlertCircle, UserPlus } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import s from '../Login/Login.module.css'

function buildSchema(t) {
  return z.object({
    first_name: z.string().min(1, t('auth.errors.firstNameRequired')),
    last_name:  z.string().min(1, t('auth.errors.lastNameRequired')),
    email:      z.string().min(1, t('auth.errors.emailRequired')).email(t('auth.errors.emailInvalid')),
    password:   z.string().min(1, t('auth.errors.passwordRequired')).min(8, t('auth.errors.passwordMin')),
    password_confirm: z.string(),
    cgv: z.literal(true, { errorMap: () => ({ message: t('auth.errors.cgvRequired') }) }),
  }).refine(d => d.password === d.password_confirm, {
    message: t('auth.errors.passwordMatch'),
    path: ['password_confirm'],
  })
}

export default function Register() {
  const { t }        = useTranslation()
  const { register: authRegister } = useAuth()
  const navigate     = useNavigate()

  const [showPwd,     setShowPwd]     = useState(false)
  const [showPwd2,    setShowPwd2]    = useState(false)
  const [globalError, setGlobalError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(buildSchema(t)),
    defaultValues: { cgv: false },
  })

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
    <div className={s.page}>
      <div className={s.card}>

        {/* En-tête */}
        <div className={s.header}>
          <Link to="/" className={s.logo}>✦ Au Point-Compté</Link>
          <h1 className={s.title}>{t('auth.registerTitle')}</h1>
          <p className={s.subtitle}>{t('auth.registerSubtitle')}</p>
        </div>

        {/* Erreur globale */}
        {globalError && (
          <div className={s.globalError} role="alert">
            <AlertCircle size={16} />
            {globalError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className={s.form}>

          {/* Prénom + Nom */}
          <div className={s.row}>
            <div className={s.field}>
              <label htmlFor="reg-first-name" className={s.label}>{t('auth.firstName')}</label>
              <input
                id="reg-first-name"
                type="text"
                autoComplete="given-name"
                placeholder={t('auth.firstNamePlaceholder')}
                className={`${s.input} ${errors.first_name ? s.error : ''}`}
                {...register('first_name')}
              />
              {errors.first_name && (
                <span className={s.fieldError}><AlertCircle size={12} />{errors.first_name.message}</span>
              )}
            </div>

            <div className={s.field}>
              <label htmlFor="reg-last-name" className={s.label}>{t('auth.lastName')}</label>
              <input
                id="reg-last-name"
                type="text"
                autoComplete="family-name"
                placeholder={t('auth.lastNamePlaceholder')}
                className={`${s.input} ${errors.last_name ? s.error : ''}`}
                {...register('last_name')}
              />
              {errors.last_name && (
                <span className={s.fieldError}><AlertCircle size={12} />{errors.last_name.message}</span>
              )}
            </div>
          </div>

          {/* Email */}
          <div className={s.field}>
            <label htmlFor="reg-email" className={s.label}>{t('auth.email')}</label>
            <input
              id="reg-email"
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
            <label htmlFor="reg-password" className={s.label}>{t('auth.password')}</label>
            <div className={s.inputWrap}>
              <input
                id="reg-password"
                type={showPwd ? 'text' : 'password'}
                autoComplete="new-password"
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

          {/* Confirmation mot de passe */}
          <div className={s.field}>
            <label htmlFor="reg-password-confirm" className={s.label}>{t('auth.passwordConfirm')}</label>
            <div className={s.inputWrap}>
              <input
                id="reg-password-confirm"
                type={showPwd2 ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t('auth.passwordConfirmPlaceholder')}
                className={`${s.input} ${s.withEye} ${errors.password_confirm ? s.error : ''}`}
                {...register('password_confirm')}
              />
              <button
                type="button"
                className={s.eyeBtn}
                onClick={() => setShowPwd2(p => !p)}
                aria-label={showPwd2 ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPwd2 ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password_confirm && (
              <span className={s.fieldError}><AlertCircle size={12} />{errors.password_confirm.message}</span>
            )}
          </div>

          {/* Acceptation CGV */}
          <div className={s.field}>
            <div className={s.cgvRow}>
              <input
                id="reg-cgv"
                type="checkbox"
                className={s.checkbox}
                {...register('cgv')}
              />
              <label htmlFor="reg-cgv" className={s.cgvLabel}>
                {t('auth.cgvAccept')}{' '}
                <Link to="/cgv">{t('auth.cgvLink')}</Link>
              </label>
            </div>
            {errors.cgv && (
              <span className={s.fieldError}><AlertCircle size={12} />{errors.cgv.message}</span>
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

        {/* Pied */}
        <p className={s.footer}>
          {t('auth.alreadyAccount')}
          <Link to="/connexion">{t('auth.signIn')}</Link>
        </p>

      </div>
    </div>
  )
}
