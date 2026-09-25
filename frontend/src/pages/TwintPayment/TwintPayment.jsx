import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle, Loader, Clock } from 'lucide-react'
import { confirmTwintQrReturn } from '../../services/payments.service.js'
import s from './TwintPayment.module.css'

/* Retour d'un paiement Twint lancé depuis l'e-mail « Payer par Twint » que la
   boutique envoie depuis l'administration.

   La cliente arrive ici depuis le téléphone qui a servi à payer, le plus
   souvent sans être connectée au site : la page est publique. Le serveur
   vérifie le paiement auprès de Stripe et valide la commande sans attendre le
   webhook. Avant cette page, le retour menait à la caisse, réservée aux comptes
   connectés : la cliente tombait sur « Connexion », puis lisait « Réglez votre
   facture sous 30 jours » — au risque de payer deux fois. */

// Twint confirme en général en quelques secondes : quelques vérifications
// automatiques, puis un bouton pour relancer à la main
const MAX_AUTO_CHECKS = 5
const RECHECK_DELAY_MS = 3000

const CONTACT_EMAIL = 'contact@broderie.ch'

// Sans icône : sur plusieurs lignes, elle restait seule au bord gauche du texte centré
function ContactNote({ children }) {
  return (
    <p className={s.note}>
      <span>
        {children} <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </span>
    </p>
  )
}

export default function TwintPayment() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Lus une seule fois : l'adresse est nettoyée aussitôt, elle porte le secret du paiement
  const [payment] = useState(() => ({
    intent: searchParams.get('payment_intent') || '',
    secret: searchParams.get('payment_intent_client_secret') || '',
  }))
  const complete = Boolean(payment.intent && payment.secret)

  // loading | paid | processing | failed | invalid | error
  const [state,   setState]   = useState(complete ? 'loading' : 'invalid')
  const [orderId, setOrderId] = useState(null)
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  // Une seule requête par vérification — React exécute les effets deux fois en développement
  const checkedRef = useRef(-1)

  useEffect(() => {
    if (complete) navigate('/paiement-twint', { replace: true })
  }, [complete, navigate])

  useEffect(() => {
    if (!complete || checkedRef.current === attempt) return
    checkedRef.current = attempt

    confirmTwintQrReturn(payment.intent, payment.secret)
      .then((result) => {
        setOrderId(result.orderId)
        setState(result.paymentStatus)
      })
      .catch((err) => {
        const status = err.response?.status
        // Lien incomplet ou inconnu : réessayer n'y changerait rien
        if (status === 400 || status === 404) { setState('invalid'); return }
        setMessage(err.response?.data?.message ?? '')
        setState('error')
      })
  }, [attempt, complete, payment])

  // Paiement encore en validation chez Twint : nouvelle vérification dans un instant
  useEffect(() => {
    if (state !== 'processing' || attempt >= MAX_AUTO_CHECKS) return
    const timer = setTimeout(() => setAttempt((n) => n + 1), RECHECK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [state, attempt])

  const recheck = () => {
    if (state === 'error') setState('loading')
    setAttempt((n) => n + 1)
  }

  return (
    <div className={s.page}>
      <div className={s.card}>
        {state === 'loading' && (
          <>
            <div className={s.stateIcon} data-type="loading">
              <Loader size={40} className={s.spin} aria-hidden="true" />
            </div>
            <h1 className={s.title}>Vérification de votre paiement…</h1>
          </>
        )}

        {state === 'paid' && (
          <>
            <div className={s.stateIcon} data-type="success">
              <CheckCircle size={40} aria-hidden="true" />
            </div>
            <h1 className={s.title}>Paiement reçu, merci&nbsp;!</h1>
            <p className={s.text} role="status">
              Votre paiement Twint pour la commande n°&nbsp;{orderId} a bien été reçu.
              Vous n'avez plus rien à régler pour cette commande.
            </p>
            <Link to="/" className={s.btn}>Retour à la boutique</Link>
          </>
        )}

        {state === 'processing' && (
          <>
            <div className={s.stateIcon} data-type="loading">
              <Clock size={40} aria-hidden="true" />
            </div>
            <h1 className={s.title}>Paiement en cours de validation</h1>
            <p className={s.text} role="status">
              {attempt < MAX_AUTO_CHECKS
                ? 'Twint confirme votre paiement : cela ne prend en général que quelques secondes. Cette page se met à jour toute seule.'
                : 'La confirmation de Twint prend plus de temps que prévu. Vous pouvez vérifier à nouveau dans un instant.'}
            </p>
            {attempt >= MAX_AUTO_CHECKS && (
              <button type="button" className={s.btnButton} onClick={recheck}>Vérifier à nouveau</button>
            )}
          </>
        )}

        {state === 'failed' && (
          <>
            <div className={s.stateIcon} data-type="error">
              <XCircle size={40} aria-hidden="true" />
            </div>
            <h1 className={s.title}>Le paiement n'a pas abouti</h1>
            <p className={s.text} role="alert">
              Aucun montant n'a été débité. Le code de paiement a peut-être expiré,
              ou été remplacé par un code plus récent.
            </p>
            <ContactNote>Pour recevoir un nouveau code de paiement, écrivez-nous à</ContactNote>
            <Link to="/" className={s.btn}>Retour à la boutique</Link>
          </>
        )}

        {state === 'invalid' && (
          <>
            <div className={s.stateIcon} data-type="error">
              <XCircle size={40} aria-hidden="true" />
            </div>
            <h1 className={s.title}>Ce lien de paiement n'est pas reconnu</h1>
            <p className={s.text} role="alert">
              Il est peut-être incomplet. Si vous avez confirmé le paiement dans
              l'application Twint, il nous parviendra quand même.
            </p>
            <ContactNote>Une question ? Écrivez-nous à</ContactNote>
            <Link to="/" className={s.btn}>Retour à la boutique</Link>
          </>
        )}

        {state === 'error' && (
          <>
            <div className={s.stateIcon} data-type="error">
              <XCircle size={40} aria-hidden="true" />
            </div>
            <h1 className={s.title}>Vérification impossible pour le moment</h1>
            <p className={s.text} role="alert">
              {message || 'Nous n\'avons pas pu vérifier votre paiement. Réessayez dans un instant.'}
            </p>
            <p className={s.note}>
              Si vous avez confirmé le paiement dans l'application Twint, il nous
              parviendra même si cette page ne peut pas l'afficher.
            </p>
            <button type="button" className={s.btnButton} onClick={recheck}>Réessayer</button>
          </>
        )}
      </div>
    </div>
  )
}
