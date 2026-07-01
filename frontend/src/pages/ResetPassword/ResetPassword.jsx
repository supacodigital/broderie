import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, Eye, EyeOff, CheckCircle, XCircle, Lock } from 'lucide-react'
import { resetPassword } from '../../services/auth.service.js'
import s from './ResetPassword.module.css'

const schema = z.object({
  password: z.string().min(8, 'Minimum 8 caractères'),
  confirm: z.string().min(1, 'Veuillez confirmer le mot de passe'),
}).refine((d) => d.password === d.confirm, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirm'],
})

export default function ResetPassword() {
  const [searchParams]       = useSearchParams()
  const navigate             = useNavigate()
  const token                = searchParams.get('token') || ''

  const [showPwd,    setShowPwd]    = useState(false)
  const [showConf,   setShowConf]   = useState(false)
  const [success,    setSuccess]    = useState(false)
  const [apiError,   setApiError]   = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (values) => {
    setApiError('')
    try {
      await resetPassword(token, values.password)
      setSuccess(true)
    } catch (err) {
      const status = err.response?.status
      if (status === 400) {
        setApiError('Ce lien est invalide ou a expiré. Veuillez faire une nouvelle demande.')
      } else {
        setApiError('Une erreur est survenue. Veuillez réessayer.')
      }
    }
  }

  /* Lien manquant dans l'URL */
  if (!token) {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <div className={s.stateIcon} data-type="error">
            <XCircle size={40} />
          </div>
          <h1 className={s.title}>Lien invalide</h1>
          <p className={s.stateDesc}>
            Ce lien de réinitialisation est invalide ou a expiré.
          </p>
          <Link to="/mot-de-passe-oublie" className={s.ctaBtn}>
            Nouvelle demande
          </Link>
        </div>
      </div>
    )
  }

  /* Succès */
  if (success) {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <div className={s.stateIcon} data-type="success">
            <CheckCircle size={40} />
          </div>
          <h1 className={s.title}>Mot de passe modifié !</h1>
          <p className={s.stateDesc}>
            Votre mot de passe a été mis à jour avec succès. Vous pouvez maintenant vous connecter.
          </p>
          <button
            type="button"
            className={s.ctaBtn}
            onClick={() => navigate('/connexion')}
          >
            Se connecter
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={s.page}>
      <div className={s.card}>

        <div className={s.header}>
          <Link to="/" className={s.logo}>✦ Au Point-Compté</Link>
          <h1 className={s.title}>Nouveau mot de passe</h1>
          <p className={s.subtitle}>Choisissez un mot de passe sécurisé pour votre compte.</p>
        </div>

        {apiError && (
          <div className={s.globalError} role="alert">
            <XCircle size={16} />
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className={s.form}>

          {/* Nouveau mot de passe */}
          <div className={s.field}>
            <label htmlFor="rp-password" className={s.label}>Nouveau mot de passe</label>
            <div className={s.inputWrap}>
              <Lock size={16} className={s.inputIcon} />
              <input
                id="rp-password"
                type={showPwd ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Votre nouveau mot de passe"
                className={`${s.input} ${s.withIcon} ${s.withEye} ${errors.password ? s.error : ''}`}
                aria-invalid={errors.password ? 'true' : undefined}
                aria-describedby={`rp-password-hint${errors.password ? ' rp-password-error' : ''}`}
                {...register('password')}
              />
              <button
                type="button"
                className={s.eyeBtn}
                onClick={() => setShowPwd(p => !p)}
                aria-label={showPwd ? 'Masquer' : 'Afficher'}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Indication de format — toujours visible pour guider la saisie */}
            <p id="rp-password-hint" className={s.fieldHint}>Au moins 8 caractères.</p>

            {errors.password && (
              <span id="rp-password-error" className={s.fieldError} role="alert">
                <AlertCircle size={12} aria-hidden="true" />{errors.password.message}
              </span>
            )}
          </div>

          {/* Confirmer */}
          <div className={s.field}>
            <label htmlFor="rp-confirm" className={s.label}>Confirmer le mot de passe</label>
            <div className={s.inputWrap}>
              <Lock size={16} className={s.inputIcon} />
              <input
                id="rp-confirm"
                type={showConf ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Répétez le mot de passe"
                className={`${s.input} ${s.withIcon} ${s.withEye} ${errors.confirm ? s.error : ''}`}
                {...register('confirm')}
              />
              <button
                type="button"
                className={s.eyeBtn}
                onClick={() => setShowConf(p => !p)}
                aria-label={showConf ? 'Masquer' : 'Afficher'}
              >
                {showConf ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.confirm && (
              <span className={s.fieldError}>
                <AlertCircle size={12} />{errors.confirm.message}
              </span>
            )}
          </div>

          <button type="submit" className={s.submitBtn} disabled={isSubmitting}>
            {isSubmitting ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
          </button>

        </form>

      </div>
    </div>
  )
}

