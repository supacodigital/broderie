import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, Mail, ArrowLeft, CheckCircle } from 'lucide-react'
import { forgotPassword } from '../../services/auth.service.js'
import s from './ForgotPassword.module.css'

const schema = z.object({
  email: z.string().min(1, 'L\'adresse email est obligatoire').email('Format d\'email invalide'),
})

export default function ForgotPassword() {
  const [sent, setSent] = useState(false)

  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (values) => {
    /* Réponse toujours 200 côté serveur (anti-énumération) */
    await forgotPassword(values.email).catch(() => {})
    setSent(true)
  }

  /* Écran de confirmation envoyé */
  if (sent) {
    return (
      <div className={s.page}>
        <div className={s.card}>
          <div className={s.successIcon}>
            <CheckCircle size={40} />
          </div>
          <h1 className={s.title}>Email envoyé !</h1>
          <p className={s.successDesc}>
            Si un compte correspond à <strong>{getValues('email')}</strong>, vous allez recevoir
            un email avec un lien de réinitialisation valable <strong>1 heure</strong>.
          </p>
          <p className={s.successHint}>
            Vérifiez également votre dossier spam.
          </p>
          <Link to="/connexion" className={s.backBtn}>
            <ArrowLeft size={16} />
            Retour à la connexion
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={s.page}>
      <div className={s.card}>

        <div className={s.header}>
          <Link to="/" className={s.logo}>✦ Au Point-Compté</Link>
          <h1 className={s.title}>Mot de passe oublié</h1>
          <p className={s.subtitle}>
            Indiquez votre email — nous vous envoyons un lien de réinitialisation.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className={s.form}>

          <div className={s.field}>
            <label htmlFor="fp-email" className={s.label}>Adresse email</label>
            <div className={s.inputWrap}>
              <Mail size={16} className={s.inputIcon} />
              <input
                id="fp-email"
                type="email"
                autoComplete="email"
                placeholder="votre@email.ch"
                className={`${s.input} ${s.withIcon} ${errors.email ? s.error : ''}`}
                {...register('email')}
              />
            </div>
            {errors.email && (
              <span className={s.fieldError}>
                <AlertCircle size={12} />{errors.email.message}
              </span>
            )}
          </div>

          <button type="submit" className={s.submitBtn} disabled={isSubmitting}>
            {isSubmitting ? 'Envoi en cours…' : 'Envoyer le lien'}
          </button>

        </form>

        <Link to="/connexion" className={s.footerLink}>
          <ArrowLeft size={14} />
          Retour à la connexion
        </Link>

      </div>
    </div>
  )
}
