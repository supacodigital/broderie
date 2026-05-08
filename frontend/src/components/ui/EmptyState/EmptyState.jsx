import { Link } from 'react-router-dom'
import s from './EmptyState.module.css'

export default function EmptyState({ icon = '🔍', title, desc, ctaLabel, ctaTo, onRetry }) {
  return (
    <div className={s.wrap}>
      <span className={s.icon} aria-hidden="true">{icon}</span>
      <p className={s.title}>{title}</p>
      {desc && <p className={s.desc}>{desc}</p>}
      <div className={s.actions}>
        {ctaTo && <Link to={ctaTo} className={s.btn}>{ctaLabel}</Link>}
        {onRetry && <button onClick={onRetry} className={s.btn}>{ctaLabel}</button>}
      </div>
    </div>
  )
}
