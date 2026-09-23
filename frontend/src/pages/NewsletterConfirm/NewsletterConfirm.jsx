import { useEffect, useState, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle, Loader, Mail } from 'lucide-react'
import { confirmSubscription } from '../../services/newsletter.service.js'
import s from './NewsletterConfirm.module.css'

/* Confirmation d'inscription à la newsletter — atterrissage du lien reçu par
   e-mail (double opt-in, CLI-05).

   L'inscription faite depuis le formulaire du site reste inactive tant que ce
   lien n'a pas été ouvert : c'est la preuve que la personne détient l'adresse et
   consent à recevoir la newsletter. La confirmation part dès l'ouverture de la
   page — le clic dans l'e-mail EST l'acte de consentement. */
export default function NewsletterConfirm() {
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') || ''
  const token = searchParams.get('token') || ''

  // Lien incomplet (coupé par la messagerie) : erreur d'emblée, sans appel réseau
  const [state,   setState]   = useState(() => (email && token ? 'loading' : 'error')) // loading | success | error
  const [message, setMessage] = useState('')
  const ranRef = useRef(false)

  useEffect(() => {
    // Garde-fou StrictMode : la confirmation ne part qu'une fois
    if (ranRef.current) return
    ranRef.current = true

    if (!email || !token) return

    confirmSubscription(email, token)
      .then((res) => { setMessage(res.message ?? ''); setState('success') })
      .catch((err) => { setMessage(err.response?.data?.message ?? ''); setState('error') })
  }, [email, token])

  return (
    <div className={s.page}>
      <div className={s.card}>
        {state === 'loading' && (
          <>
            <div className={s.stateIcon} data-type="loading">
              <Loader size={40} className={s.spin} aria-hidden="true" />
            </div>
            <h1 className={s.title}>Confirmation en cours…</h1>
          </>
        )}

        {state === 'success' && (
          <>
            <div className={s.stateIcon} data-type="success">
              <CheckCircle size={40} aria-hidden="true" />
            </div>
            <h1 className={s.title}>Inscription confirmée</h1>
            <p className={s.text} role="status">
              {message || 'Votre inscription à la newsletter est confirmée. Merci !'}
            </p>
            <p className={s.note}>
              Vous pourrez vous désinscrire à tout moment, en un clic, grâce au lien
              présent dans chaque newsletter.
            </p>
            <Link to="/" className={s.btn}>Découvrir la boutique</Link>
          </>
        )}

        {state === 'error' && (
          <>
            <div className={s.stateIcon} data-type="error">
              <XCircle size={40} aria-hidden="true" />
            </div>
            <h1 className={s.title}>Ce lien n'est plus valable</h1>
            <p className={s.text} role="alert">
              {message || 'Nous n\'avons pas pu confirmer cette inscription. Le lien est peut-être incomplet ou a expiré.'}
            </p>
            <p className={s.note}>
              <Mail size={14} aria-hidden="true" />
              <span>
                Vous pouvez refaire la demande depuis le bas de la page d'accueil : un
                nouveau lien vous sera envoyé.
              </span>
            </p>
            <Link to="/" className={s.btn}>Retour à la boutique</Link>
          </>
        )}
      </div>
    </div>
  )
}
