import { Link } from 'react-router-dom'
import { Home, ArrowLeft, Search } from 'lucide-react'
import s from './NotFound.module.css'

export default function NotFound() {
  return (
    <div className={s.page}>
      <div className={s.inner}>
        {/* Visuel décoratif */}
        <div className={s.visual} aria-hidden="true">
          <span className={s.needle}>🪡</span>
          <div className={s.thread} />
        </div>

        <p className={s.code}>404</p>
        <h1 className={s.title}>Le fil s'est perdu…</h1>
        <p className={s.desc}>
          Cette page n'existe pas ou a été déplacée.<br />
          Pas d'inquiétude — revenez à la broderie !
        </p>

        <div className={s.actions}>
          <Link to="/" className={s.btnPrimary}>
            <Home size={16} />
            Retour à l'accueil
          </Link>
          <Link to="/catalogue" className={s.btnSecondary}>
            <Search size={16} />
            Voir le catalogue
          </Link>
        </div>

        <div className={s.linksRow}>
          <Link to="/connexion">Mon compte</Link>
          <span>·</span>
          <Link to="/panier">Mon panier</Link>
          <span>·</span>
          <Link to="/cgv">CGV</Link>
        </div>
      </div>
    </div>
  )
}
