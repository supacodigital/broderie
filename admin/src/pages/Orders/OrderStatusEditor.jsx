import { useState } from 'react'
import { ChevronDown, RefreshCw, SlidersHorizontal } from 'lucide-react'
import Card from '../../components/ui/Card/Card.jsx'
import s from './OrderStatusEditor.module.css'

export const STATUS_OPTIONS = [
  { value: 'pending',          label: 'En attente' },
  { value: 'awaiting_payment', label: 'En attente de paiement' },
  // Posé uniquement par Stripe : visible dans la liste, pas choisissable à la main
  { value: 'payment_failed',   label: 'Paiement refusé', disabled: true },
  { value: 'pending_invoice',  label: 'Facture à payer' },
  { value: 'pending_pickup',   label: 'Retrait en attente' },
  { value: 'ready_for_pickup', label: 'Prête pour le retrait' },
  { value: 'paid',             label: 'Payée' },
  { value: 'processing',       label: 'En préparation' },
  { value: 'shipped',          label: 'Expédiée' },
  { value: 'delivered',        label: 'Livrée' },
  { value: 'cancelled',        label: 'Annulée' },
  { value: 'refunded',         label: 'Remboursée' },
]

/* Changement de statut libre — pour les cas hors parcours (annulation,
   remboursement, correction). Replié : les actions courantes sont dans
   « Traitement ». */
export default function OrderStatusEditor({ status, saving, onSubmit }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(status)
  const [note, setNote] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (value === status) return
    const done = await onSubmit(value, note)
    if (done) { setNote(''); setOpen(false) }
  }

  return (
    <Card title="Statut" icon={SlidersHorizontal}>
      <div className={s.body}>
        <button
          type="button"
          className={s.toggle}
          aria-expanded={open}
          aria-controls="status-editor"
          onClick={() => { setValue(status); setOpen(o => !o) }}
        >
          Modifier le statut manuellement
          <ChevronDown size={14} className={s.chevron} data-open={open} aria-hidden="true" />
        </button>

        {open && (
          <form id="status-editor" className={s.form} onSubmit={submit}>
            <label className={s.label} htmlFor="status-select">Nouveau statut</label>
            <select id="status-select" className={s.select} value={value} onChange={e => setValue(e.target.value)}>
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
              ))}
            </select>
            <label className={s.label} htmlFor="status-note">Note pour l'historique <span className={s.optional}>facultatif</span></label>
            <textarea
              id="status-note"
              className={s.textarea}
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
            />
            <button type="submit" className={s.btnSave} disabled={saving || value === status}>
              {saving ? <><RefreshCw size={13} className={s.spin} aria-hidden="true" /> Enregistrement…</> : 'Enregistrer le statut'}
            </button>
          </form>
        )}
      </div>
    </Card>
  )
}
