import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Cookie, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { logConsent } from '../../../services/consent.service.js'
import s from './CookieBanner.module.css'

const STORAGE_KEY = 'cookie_consent'
/* 1.1 (25.09.2026) : textes rendus exacts — ni cookie de langue ni mesure
   d'audience, Google Fonts retiré. Le bandeau réapparaît une fois chez qui
   avait choisi sur la foi de l'ancien texte ; le choix est journalisé avec
   cette version. */
const VERSION     = '1.1'

export default function CookieBanner() {
  const [visible,  setVisible]  = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
      if (!saved || saved.version !== VERSION) setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [])

  function save(accepted) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accepted, version: VERSION, at: Date.now() }))
    logConsent('cookies', accepted)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className={s.banner} role="dialog" aria-label="Consentement aux cookies" aria-modal="false">
      <div className={s.inner}>
        {/* Icône + texte principal */}
        <div className={s.top}>
          <Cookie size={20} className={s.icon} aria-hidden="true" />
          <p className={s.text}>
            Ce site n'utilise que des cookies nécessaires à son fonctionnement (panier, connexion
            à votre compte), et ceux de Stripe au moment du paiement. Aucune publicité ni mesure
            d'audience.{' '}
            <button className={s.detailToggle} onClick={() => setExpanded(o => !o)} aria-expanded={expanded}>
              En savoir plus {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </p>
        </div>

        {/* Détails — expandable */}
        {expanded && (
          <div className={s.detail}>
            <div className={s.detailRow}>
              <Check size={13} className={s.checkIcon} />
              <span><strong>Essentiels</strong> — panier, connexion à votre compte. Toujours actifs.</span>
            </div>
            <div className={s.detailRow}>
              <Check size={13} className={s.checkIcon} />
              <span><strong>Stripe</strong> — sécurité du paiement et prévention de la fraude. Déposés uniquement au moment du paiement.</span>
            </div>
            <p className={s.detailLegal}>
              Conformément à la LPD révisée (sept. 2023). Site hébergé en Suisse.{' '}
              {/* /confidentialite n'a jamais existé : le lien menait à la page 404 */}
              <Link to="/mentions-legales#donnees" className={s.detailLink}>Données personnelles et cookies</Link>
            </p>
          </div>
        )}

        {/* Actions */}
        <div className={s.actions}>
          <button className={s.btnRefuse} onClick={() => save(false)}>
            Refuser
          </button>
          <button className={s.btnAccept} onClick={() => save(true)}>
            Accepter
          </button>
        </div>
      </div>
    </div>
  )
}
