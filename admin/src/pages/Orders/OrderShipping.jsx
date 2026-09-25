import { useState } from 'react'
import { Check, Download, ExternalLink, RefreshCw, Truck } from 'lucide-react'
import Card from '../../components/ui/Card/Card.jsx'
import CopyButton from '../../components/ui/CopyButton/CopyButton.jsx'
import s from './OrderShipping.module.css'

/* Suivi du colis : numéro La Poste (lien), étiquette, saisie manuelle d'un
   numéro obtenu ailleurs (WebStamp, guichet). */
export default function OrderShipping({ order, onSaveTracking, onDownloadLabel }) {
  const [value,  setValue]  = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    const tracking = value.trim()
    if (!tracking) return
    setSaving(true)
    try {
      if (await onSaveTracking(tracking)) setValue('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Expédition" icon={Truck}>
      <div className={s.body}>
        {order.tracking_number ? (
          <div className={s.tracking}>
            <span className={s.label}>N° de suivi</span>
            <div className={s.trackingRow}>
              <code className={s.code}>{order.tracking_number}</code>
              <CopyButton text={order.tracking_number} label="Copier le numéro de suivi" />
            </div>
            <a
              href={`https://www.post.ch/fr/outils/suivi-de-colis?track=${encodeURIComponent(order.tracking_number)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={s.link}
            >
              Suivre le colis sur post.ch <ExternalLink size={11} aria-hidden="true" />
            </a>
          </div>
        ) : (
          <p className={s.empty}>Aucun numéro de suivi pour l'instant.</p>
        )}

        {order.label_url && (
          <button type="button" className={s.btnGhost} onClick={onDownloadLabel}>
            <Download size={13} aria-hidden="true" /> Télécharger l'étiquette
          </button>
        )}

        <form className={s.manual} onSubmit={save}>
          <label className={s.label} htmlFor="manual-tracking">
            {order.tracking_number ? 'Remplacer le n° de suivi' : 'Saisir un n° de suivi'}
          </label>
          <div className={s.inputRow}>
            <input
              id="manual-tracking"
              type="text"
              className={s.input}
              placeholder="99.00.123456.78901234"
              value={value}
              onChange={e => setValue(e.target.value)}
              autoComplete="off"
            />
            <button type="submit" className={s.btnIcon} disabled={saving || !value.trim()} aria-label="Enregistrer le numéro de suivi">
              {saving ? <RefreshCw size={13} className={s.spin} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
            </button>
          </div>
          <span className={s.hint}>Pour un envoi affranchi sur WebStamp ou au guichet.</span>
        </form>
      </div>
    </Card>
  )
}
