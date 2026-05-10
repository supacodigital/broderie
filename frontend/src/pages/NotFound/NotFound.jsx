import { Link } from 'react-router-dom'
import { Home, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import s from './NotFound.module.css'

export default function NotFound() {
  const { t } = useTranslation()

  return (
    <div className={s.page}>
      <div className={s.inner}>
        {/* Visuel décoratif */}
        <div className={s.visual} aria-hidden="true">
          <span className={s.needle}>🪡</span>
          <div className={s.thread} />
        </div>

        <p className={s.code}>404</p>
        <h1 className={s.title}>{t('notFound.title')}</h1>
        <p className={s.desc}>{t('notFound.desc')}</p>

        <div className={s.actions}>
          <Link to="/" className={s.btnPrimary}>
            <Home size={16} />
            {t('notFound.backHome')}
          </Link>
          <Link to="/catalogue" className={s.btnSecondary}>
            <Search size={16} />
            {t('notFound.seeCatalogue')}
          </Link>
        </div>

        <div className={s.linksRow}>
          <Link to="/connexion">{t('notFound.myAccount')}</Link>
          <span>·</span>
          <Link to="/panier">{t('notFound.myCart')}</Link>
          <span>·</span>
          <Link to="/cgv">{t('footer.helpLinks.cgv')}</Link>
        </div>
      </div>
    </div>
  )
}
