import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, AlertCircle, Lock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import s from './Login.module.css'

const schema = z.object({
  email:    z.string().email('Adresse e-mail invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

export default function Login() {
  const { login }                = useAuth()
  const navigate                 = useNavigate()
  const [showPwd, setShowPwd]    = useState(false)
  const [globalError, setGlobalError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data) => {
    setGlobalError('')
    try {
      const result = await login(data)

      if (result?.mfaRequired === 'setup') {
        navigate('/mfa/configuration', { replace: true })
        return
      }
      if (result?.mfaRequired === 'verify') {
        navigate('/mfa/verification', { replace: true })
        return
      }

      const user = result
      if (!user || user.role !== 'admin') {
        setGlobalError('Accès réservé aux administrateurs.')
        return
      }
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const status = err?.response?.status
      if (status === 401) {
        setGlobalError('Identifiants incorrects.')
      } else {
        setGlobalError('Une erreur est survenue. Veuillez réessayer.')
      }
    }
  }

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.logoWrap}>
          <span className={s.logo}>✦</span>
        </div>
        <h1 className={s.title}>Administration</h1>
        <p className={s.subtitle}>Au Point-Compté</p>

        {globalError && (
          <div className={s.alert} role="alert">
            <AlertCircle size={15} />
            {globalError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className={s.form}>
          <div className={s.field}>
            <label htmlFor="email" className={s.label}>Adresse e-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              className={`${s.input} ${errors.email ? s.inputError : ''}`}
              {...register('email')}
            />
            {errors.email && (
              <span className={s.fieldError}><AlertCircle size={12} />{errors.email.message}</span>
            )}
          </div>

          <div className={s.field}>
            <label htmlFor="password" className={s.label}>Mot de passe</label>
            <div className={s.pwdWrap}>
              <input
                id="password"
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                className={`${s.input} ${errors.password ? s.inputError : ''}`}
                {...register('password')}
              />
              <button
                type="button"
                className={s.eyeBtn}
                onClick={() => setShowPwd(v => !v)}
                aria-label={showPwd ? 'Masquer' : 'Afficher'}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && (
              <span className={s.fieldError}><AlertCircle size={12} />{errors.password.message}</span>
            )}
          </div>

          <button type="submit" className={s.btn} disabled={isSubmitting}>
            <Lock size={15} />
            {isSubmitting ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
