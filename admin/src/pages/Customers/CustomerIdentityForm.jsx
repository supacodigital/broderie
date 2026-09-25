import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { updateCustomer } from '../../services/customers.service.js'
import s from './CustomerIdentityForm.module.css'

/* Mêmes règles que adminUpdateCustomerSchema côté serveur */
const nameField = (label) => z
  .string()
  .trim()
  .min(1, `${label} est obligatoire.`)
  .max(100, `${label} ne peut pas dépasser 100 caractères.`)

const schema = z.object({
  first_name: nameField('Le prénom'),
  last_name:  nameField('Le nom'),
  email: z
    .string()
    .trim()
    .min(1, "L'adresse e-mail est obligatoire.")
    .max(255, "L'adresse e-mail ne peut pas dépasser 255 caractères.")
    .email('Adresse e-mail invalide.'),
})

/* ── Modification de la fiche client par la boutique (CLI-06) ──
   Prénom, nom et adresse e-mail — la cliente ne peut pas changer son adresse
   elle-même. */
export default function CustomerIdentityForm({ customer, onSaved, onCancel }) {
  const [apiError, setApiError] = useState('')

  const { register, handleSubmit, watch, setError, setFocus, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: customer.first_name ?? '',
      last_name:  customer.last_name  ?? '',
      email:      customer.email      ?? '',
    },
  })

  useEffect(() => { setFocus('first_name') }, [setFocus])

  const emailChanged = watch('email').trim().toLowerCase() !== (customer.email ?? '').toLowerCase()

  const onSubmit = async (formData) => {
    setApiError('')
    try {
      const updated = await updateCustomer(customer.id, formData)
      onSaved(updated)
    } catch (err) {
      if (!err.response) {
        setApiError('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.')
        return
      }
      const { status, data } = err.response
      if (status === 409) {
        setError('email', { type: 'server', message: data?.message })
        return
      }
      const fieldErrors = data?.errors
      if (fieldErrors?.length) {
        // Première erreur de chaque champ uniquement
        const seen = new Set()
        fieldErrors.forEach(({ field, message }) => {
          if (!(field in schema.shape) || seen.has(field)) return
          seen.add(field)
          setError(field, { type: 'server', message })
        })
        return
      }
      setApiError(status >= 500
        ? 'Une erreur serveur est survenue. Veuillez réessayer dans un instant.'
        : (data?.message ?? 'Une erreur est survenue.'))
    }
  }

  /* Échap annule la modification sans fermer la fiche */
  const handleKeyDown = (e) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    onCancel()
  }

  return (
    <form className={s.form} onSubmit={handleSubmit(onSubmit)} onKeyDown={handleKeyDown} noValidate>
      {apiError && (
        <div className={s.apiError} role="alert"><AlertTriangle size={13} /> {apiError}</div>
      )}

      <div className={s.grid}>
        <div className={s.field}>
          <label className={s.label} htmlFor="customer-first-name">Prénom</label>
          <input
            id="customer-first-name"
            className={`${s.input} ${errors.first_name ? s.inputError : ''}`}
            autoComplete="off"
            aria-invalid={!!errors.first_name}
            {...register('first_name')}
          />
          {errors.first_name && <span className={s.err}>{errors.first_name.message}</span>}
        </div>

        <div className={s.field}>
          <label className={s.label} htmlFor="customer-last-name">Nom</label>
          <input
            id="customer-last-name"
            className={`${s.input} ${errors.last_name ? s.inputError : ''}`}
            autoComplete="off"
            aria-invalid={!!errors.last_name}
            {...register('last_name')}
          />
          {errors.last_name && <span className={s.err}>{errors.last_name.message}</span>}
        </div>

        <div className={`${s.field} ${s.fieldFull}`}>
          <label className={s.label} htmlFor="customer-email">E-mail</label>
          <input
            id="customer-email"
            type="email"
            className={`${s.input} ${errors.email ? s.inputError : ''}`}
            autoComplete="off"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
          {errors.email
            ? <span className={s.err}>{errors.email.message}</span>
            : emailChanged && (
              <span className={s.hint}>La cliente devra se connecter avec cette nouvelle adresse.</span>
            )}
        </div>
      </div>

      <div className={s.actions}>
        <button type="button" className={s.btnCancel} onClick={onCancel} disabled={isSubmitting}>
          Annuler
        </button>
        <button type="submit" className={s.btnSave} disabled={isSubmitting}>
          {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}
