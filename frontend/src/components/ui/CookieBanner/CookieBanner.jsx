import { useState, useEffect } from 'react'
import { Cookie, X, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { logConsent } from '../../../services/consent.service.js'
import s from './CookieBanner.module.css'

const STORAGE_KEY = 'cookie_consent'
const VERSION     = '1.0'

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
            Nous utilisons des cookies essentiels (session, panier, langue) et des cookies tiers
            (Stripe) pour le paiement sécurisé.{' '}
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
              <span><strong>Essentiels</strong> — session, authentification, panier, langue. Toujours actifs.</span>
            </div>
            <div className={s.detailRow}>
              <Check size={13} className={s.checkIcon} />
              <span><strong>Stripe</strong> — traitement sécurisé des paiements. Actifs uniquement lors du paiement.</span>
            </div>
            <p className={s.detailLegal}>
              Conformément à la LPD révisée (sept. 2023). Vos données restent hébergées en Suisse.{' '}
              <a href="/confidentialite" className={s.detailLink}>Politique de confidentialité</a>
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
