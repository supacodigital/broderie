import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createCustomerAddress, updateCustomerAddress } from '../../services/customers.service.js'
import { SWISS_CANTONS, CANTON_CODES } from '../../utils/cantons.js'
import s from './CustomerAddressForm.module.css'

/* Mêmes règles que adminAddressSchema côté serveur — et que le formulaire
   « Mes adresses » du compte client */
const required = (message, max) => z.string().trim().min(1, message).max(max, `${max} caractères au maximum.`)
const optional = (max) => z.string().trim().max(max, `${max} caractères au maximum.`)

const schema = z.object({
  label:         required('Le libellé est obligatoire.', 100),
  address_type:  z.enum(['both', 'shipping', 'billing']),
  first_name:    optional(100),
  last_name:     optional(100),
  street:        required('La rue est obligatoire.', 255),
  street_number: required('Le numéro est obligatoire.', 20),
  zip:           z.string().trim().regex(/^\d{4}$/, 'NPA suisse sur 4 chiffres.'),
  city:          required('La localité est obligatoire.', 100),
  canton:        z.string().refine(v => CANTON_CODES.includes(v), 'Canton obligatoire.'),
  phone:         z.string().trim()
                   .max(30, 'Le numéro de téléphone ne peut pas dépasser 30 caractères.')
                   .regex(/^[+0-9 ()./-]*$/, 'Numéro de téléphone invalide.'),
  // Case désactivée (adresse déjà par défaut) : React Hook Form n'envoie pas sa valeur
  is_default:    z.boolean().optional(),
})

/* ── Ajout ou modification d'une adresse de la cliente (CLI-06) ──
   `address` absent = nouvelle adresse. `isFirst` : la cliente n'en a encore
   aucune, celle-ci sera forcément l'adresse par défaut. */
export default function CustomerAddressForm({ customerId, address = null, isFirst = false, onSaved, onCancel }) {
  const [apiError, setApiError] = useState('')
  const isEdit = !!address
  // Le statut « par défaut » se donne, il ne se retire pas : on en désigne une autre
  const defaultLocked = isFirst || !!address?.is_default

  const { register, handleSubmit, setError, setFocus, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      label:         address?.label ?? '',
      address_type:  address?.address_type ?? 'both',
      first_name:    address?.first_name ?? '',
      last_name:     address?.last_name ?? '',
      street:        address?.street ?? '',
      street_number: address?.street_number ?? '',
      zip:           address?.zip ?? '',
      city:          address?.city ?? '',
      canton:        address?.canton ?? '',
      phone:         address?.phone ?? '',
      is_default:    defaultLocked,
    },
  })

  useEffect(() => { setFocus('label') }, [setFocus])

  const onSubmit = async ({ is_default, ...fields }) => {
    setApiError('')
    const payload = { ...fields, ...(is_default && !address?.is_default ? { is_default: true } : {}) }
    try {
      const updated = isEdit
        ? await updateCustomerAddress(customerId, address.id, payload)
        : await createCustomerAddress(customerId, payload)
      onSaved(updated)
    } catch (err) {
      if (!err.response) {
        setApiError('Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.')
        return
      }
      const { status, data } = err.response
      const fieldErrors = data?.errors
      if (status === 400 && fieldErrors?.length) {
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

  /* Échap annule la saisie sans quitter la fiche */
  const handleKeyDown = (e) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    onCancel()
  }

  const field = (name) => ({
    id: `address-${address?.id ?? 'new'}-${name}`,
    'aria-invalid': !!errors[name],
    'aria-describedby': errors[name] ? `address-${address?.id ?? 'new'}-${name}-error` : undefined,
    className: `${s.input} ${errors[name] ? s.inputError : ''}`,
    ...register(name),
  })

  const error = (name) => errors[name] && (
    <span id={`address-${address?.id ?? 'new'}-${name}-error`} className={s.err}>{errors[name].message}</span>
  )

  const labelFor = (name) => `address-${address?.id ?? 'new'}-${name}`

  return (
    <form
      className={s.form}
      onSubmit={handleSubmit(onSubmit)}
      onKeyDown={handleKeyDown}
      noValidate
      aria-label={isEdit ? `Modifier l'adresse ${address.label}` : 'Nouvelle adresse'}
    >
      {apiError && (
        <div className={s.apiError} role="alert"><AlertTriangle size={13} aria-hidden="true" /> {apiError}</div>
      )}

      <div className={s.grid}>
        <div className={`${s.field} ${s.full}`}>
          <label className={s.label} htmlFor={labelFor('label')}>Libellé</label>
          <input {...field('label')} placeholder="ex. Maison, Travail" autoComplete="off" />
          {error('label')}
        </div>

        <div className={`${s.field} ${s.full}`}>
          <label className={s.label} htmlFor={labelFor('address_type')}>Utilisation</label>
          <select {...field('address_type')}>
            <option value="both">Livraison et facturation</option>
            <option value="shipping">Livraison uniquement</option>
            <option value="billing">Facturation uniquement</option>
          </select>
        </div>

        <p className={`${s.groupHint} ${s.full}`}>Destinataire <span className={s.optional}>facultatif</span></p>

        <div className={s.field}>
          <label className={s.label} htmlFor={labelFor('first_name')}>Prénom</label>
          <input {...field('first_name')} autoComplete="off" />
          {error('first_name')}
        </div>

        <div className={s.field}>
          <label className={s.label} htmlFor={labelFor('last_name')}>Nom</label>
          <input {...field('last_name')} autoComplete="off" />
          {error('last_name')}
        </div>

        <div className={`${s.field} ${s.full}`}>
          <label className={s.label} htmlFor={labelFor('street')}>Rue</label>
          <input {...field('street')} autoComplete="off" />
          {error('street')}
        </div>

        <div className={s.field}>
          <label className={s.label} htmlFor={labelFor('street_number')}>Numéro</label>
          <input {...field('street_number')} autoComplete="off" />
          {error('street_number')}
        </div>

        <div className={s.field}>
          <label className={s.label} htmlFor={labelFor('zip')}>NPA</label>
          <input {...field('zip')} inputMode="numeric" maxLength={4} autoComplete="off" />
          {error('zip')}
        </div>

        <div className={s.field}>
          <label className={s.label} htmlFor={labelFor('city')}>Localité</label>
          <input {...field('city')} autoComplete="off" />
          {error('city')}
        </div>

        <div className={s.field}>
          <label className={s.label} htmlFor={labelFor('canton')}>Canton</label>
          <select {...field('canton')}>
            <option value="">—</option>
            {SWISS_CANTONS.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          {error('canton')}
        </div>

        <div className={`${s.field} ${s.full}`}>
          <label className={s.label} htmlFor={labelFor('phone')}>
            Téléphone <span className={s.optional}>facultatif</span>
          </label>
          <input {...field('phone')} type="tel" placeholder="ex. 079 123 45 67" autoComplete="off" />
          {error('phone')}
        </div>

        <label className={`${s.check} ${s.full}`}>
          <input type="checkbox" disabled={defaultLocked} {...register('is_default')} />
          <span>
            Adresse par défaut
            {defaultLocked && (
              <span className={s.checkHint}>
                {isFirst
                  ? 'La première adresse devient l\'adresse par défaut.'
                  : 'Pour en changer, désignez une autre adresse par défaut.'}
              </span>
            )}
          </span>
        </label>
      </div>

      <div className={s.actions}>
        <button type="button" className={s.btnCancel} onClick={onCancel} disabled={isSubmitting}>
          Annuler
        </button>
        <button type="submit" className={s.btnSave} disabled={isSubmitting}>
          {isSubmitting ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Ajouter l\'adresse'}
        </button>
      </div>
    </form>
  )
}
