import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, AlertCircle } from 'lucide-react'
import { getNewsletterPreference, setNewsletterPreference } from '../../services/profile.service.js'
import s from './NewsletterPreference.module.css'

/* Newsletter : « Oui / Non » dans le compte client (CLI-05).

   Demande de la boutique : un choix explicite, modifiable à tout moment. La case
   de l'inscription ne se revoyait plus ensuite — une cliente qui ne l'avait pas
   cochée ne pouvait pas s'inscrire depuis son compte, et celle qui l'avait cochée
   ne pouvait se retirer que par le lien des e-mails.
   Aucun choix n'est présélectionné avant le chargement de l'état réel : afficher
   « Non » par défaut pendant l'appel ferait croire à une désinscription. */
const STATUS_TEXT = {
  subscribed: 'Vous êtes inscrite à la newsletter.',
  pending:    'Inscription enregistrée : elle sera active dès que vous aurez confirmé votre adresse e-mail.',
  none:       'Vous ne recevez pas la newsletter.',
}

export default function NewsletterPreference() {
  const [status,  setStatus]  = useState(null) // null (chargement) | subscribed | pending | none
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    let cancelled = false
    getNewsletterPreference()
      .then((res) => { if (!cancelled) setStatus(res.data?.status ?? 'none') })
      .catch(() => { if (!cancelled) setError('Impossible de charger votre préférence. Rechargez la page.') })
    return () => { cancelled = true }
  }, [])

  // « Oui » couvre aussi l'inscription en attente de vérification de l'adresse
  const choice = status === null ? null : status === 'none' ? 'no' : 'yes'

  async function handleChange(value) {
    if (saving || value === choice) return
    const previous = status
    setError('')
    setSaved(false)
    setSaving(true)
    // Affichage immédiat du choix ; rétabli si l'enregistrement échoue
    setStatus(value === 'yes' ? 'subscribed' : 'none')
    try {
      const res = await setNewsletterPreference(value === 'yes')
      setStatus(res.data?.status ?? (value === 'yes' ? 'subscribed' : 'none'))
      setSaved(true)
    } catch (err) {
      setStatus(previous)
      setError(err.response?.data?.message ?? 'L\'enregistrement a échoué. Veuillez réessayer.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <fieldset className={s.fieldset} aria-busy={status === null || saving}>
      <legend className={s.legend}>Newsletter</legend>
      <p className={s.desc}>
        Nouvelles collections, tutoriels et offres réservées aux abonnées. Vous pouvez
        changer d'avis à tout moment.{' '}
        <Link to="/mentions-legales#donnees" className={s.link}>Protection des données</Link>
      </p>

      <div className={s.options}>
        {[
          { value: 'yes', label: 'Oui, je souhaite la recevoir' },
          { value: 'no',  label: 'Non merci' },
        ].map((opt) => (
          <label
            key={opt.value}
            className={`${s.option} ${choice === opt.value ? s.optionOn : ''}`}
          >
            <input
              type="radio"
              name="newsletter-preference"
              value={opt.value}
              className={s.radio}
              checked={choice === opt.value}
              disabled={status === null || saving}
              onChange={() => handleChange(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>

      {error && (
        <p className={s.error} role="alert">
          <AlertCircle size={14} aria-hidden="true" /> {error}
        </p>
      )}
      {!error && status && (
        <p className={s.status} role="status">
          {saved && <Check size={14} aria-hidden="true" />} {STATUS_TEXT[status]}
        </p>
      )}
    </fieldset>
  )
}
