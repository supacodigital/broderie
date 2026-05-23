import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { useToast } from '../../../contexts/ToastContext.jsx'
import s from './Toaster.module.css'

/* Affiche la pile de toasts en bas à droite — monté une seule fois dans Layout */
export default function Toaster() {
  const { toasts, dismiss } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className={s.region} role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`${s.toast} ${t.variant ? s[t.variant] : ''}`} role="status">
          {t.icon && <span className={s.icon}>{t.icon}</span>}

          <div className={s.body}>
            <p className={s.message}>{t.message}</p>

            {/* Action optionnelle : lien interne (to) ou bouton (onClick) */}
            {t.action && t.action.to && (
              <Link to={t.action.to} className={s.actionLink} onClick={() => dismiss(t.id)}>
                {t.action.label}
              </Link>
            )}
            {t.action && t.action.onClick && (
              <button type="button" className={s.actionLink} onClick={() => { t.action.onClick(); dismiss(t.id) }}>
                {t.action.label}
              </button>
            )}
          </div>

          <button
            type="button"
            className={s.close}
            onClick={() => dismiss(t.id)}
            aria-label="Fermer la notification"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
