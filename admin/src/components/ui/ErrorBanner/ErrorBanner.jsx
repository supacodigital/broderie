import { AlertTriangle } from 'lucide-react'
import s from './ErrorBanner.module.css'

export default function ErrorBanner({ onRetry }) {
  return (
    <div className={s.errorBanner}>
      <AlertTriangle size={14} />
      Erreur de chargement.{' '}
      {onRetry && (
        <button className={s.retryBtn} onClick={onRetry}>Réessayer</button>
      )}
    </div>
  )
}
