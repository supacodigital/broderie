import { useEffect, useState, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle, Loader, MailX } from 'lucide-react'
import { unsubscribe } from '../../services/newsletter.service.js'
import s from './Unsubscribe.module.css'

/* Désinscription de la newsletter — atterrissage du lien reçu par e-mail (CLI-05).

   La LCD suisse impose un moyen de refus simple et gratuit : la désinscription
   part donc dès l'ouverture de la page, sans demander de confirmation, sans
   connexion et sans ressaisir son adresse. Un clic depuis l'e-mail suffit.

   Le jeton présent dans l'URL prouve que la personne a bien reçu cet e-mail :
   sans lui, connaître une adresse permettrait de désabonner son propriétaire. */
export default function Unsubscribe() {
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') || ''
  const token = searchParams.get('token') || ''

  const [state, setState] = useState('loading') // loading | success | error
  const ranRef = useRef(false)

  useEffect(() => {
    // Garde-fou StrictMode : la désinscription ne part qu'une fois
    if (ranRef.current) return
    ranRef.current = true

    if (!email || !token) { setState('error'); return }

    unsubscribe(email, token)
      .then(() => setState('success'))
      .catch(() => setState('error'))
  }, [email, token])

  return (
    <div className={s.page}>
      <div className={s.card}>
        {state === 'loading' && (
          <>
            <div className={s.stateIcon} data-type="loading">
              <Loader size={40} className={s.spin} aria-hidden="true" />
            </div>
            <h1 className={s.title}>Désinscription en cours…</h1>
          </>
        )}

        {state === 'success' && (
          <>
            <div className={s.stateIcon} data-type="success">
              <CheckCircle size={40} aria-hidden="true" />
            </div>
            <h1 className={s.title}>Vous êtes désinscrite</h1>
            <p className={s.text}>
              L'adresse <strong>{email}</strong> ne recevra plus notre newsletter.
            </p>
            <p className={s.note}>
              Vos commandes et votre compte ne sont pas concernés : vous continuerez à
              recevoir les confirmations et factures de vos achats.
            </p>
            <Link to="/" className={s.btn}>Retour à la boutique</Link>
          </>
        )}

        {state === 'error' && (
          <>
            <div className={s.stateIcon} data-type="error">
              <XCircle size={40} aria-hidden="true" />
            </div>
            <h1 className={s.title}>Ce lien n'est plus valable</h1>
            <p className={s.text}>
              Nous n'avons pas pu traiter cette désinscription. Le lien est peut-être
              incomplet — certains logiciels de messagerie le coupent en deux.
            </p>
            <p className={s.note}>
              <MailX size={14} aria-hidden="true" />
              <span>
                Écrivez-nous à <a href="mailto:contact@broderie.ch">contact@broderie.ch</a> et
                nous vous retirons de la liste.
              </span>
            </p>
            <Link to="/" className={s.btn}>Retour à la boutique</Link>
          </>
        )}
      </div>
    </div>
  )
}
