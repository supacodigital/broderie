import { useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import s from './ConfirmDialog.module.css'

/**
 * Boîte de confirmation modale — remplace window.confirm.
 *
 * Usage :
 *   const [confirm, setConfirm] = useState(null)
 *   // Déclencher :
 *   setConfirm({ message: 'Supprimer ?', onConfirm: () => handleDelete(id) })
 *   // Afficher :
 *   {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
 */
export default function ConfirmDialog({ message, onConfirm, onClose, danger = true }) {
  const confirmRef = useRef(null)

  /* Focus sur le bouton Confirmer à l'ouverture */
  useEffect(() => { confirmRef.current?.focus() }, [])

  /* Fermeture clavier */
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleConfirm = () => { onConfirm(); onClose() }

  return (
    <div className={s.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="confirm-msg">
      <div className={s.dialog} onClick={e => e.stopPropagation()}>
        <div className={s.header}>
          <AlertTriangle size={18} className={danger ? s.iconDanger : s.iconWarning} aria-hidden="true" />
          <button className={s.closeBtn} onClick={onClose} aria-label="Annuler"><X size={15} /></button>
        </div>
        <p id="confirm-msg" className={s.message}>{message}</p>
        <div className={s.actions}>
          <button className={s.btnCancel} onClick={onClose}>Annuler</button>
          <button
            ref={confirmRef}
            className={danger ? s.btnDanger : s.btnConfirm}
            onClick={handleConfirm}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}
