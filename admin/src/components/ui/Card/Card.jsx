import { useId } from 'react'
import s from './Card.module.css'

/* Carte de l'admin : en-tête sur fond teinté (titre, sous-titre, action à
   droite), puis contenu libre. Le titre nomme la région pour les lecteurs
   d'écran. */
export default function Card({ title, subtitle, icon: Icon, aside, children, className = '', bodyClassName = '' }) {
  const titleId = useId()
  return (
    <section className={`${s.card} ${className}`} aria-labelledby={titleId}>
      <header className={s.head}>
        <div className={s.headText}>
          <h2 id={titleId} className={s.title}>
            {Icon && <Icon size={15} aria-hidden="true" />}
            {title}
          </h2>
          {subtitle && <p className={s.subtitle}>{subtitle}</p>}
        </div>
        {aside && <div className={s.aside}>{aside}</div>}
      </header>
      <div className={`${s.body} ${bodyClassName}`}>{children}</div>
    </section>
  )
}
