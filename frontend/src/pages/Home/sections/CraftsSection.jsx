import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import s from './CraftsSection.module.css'

export default function CraftsSection() {
  const { t } = useTranslation()
  const points = t('crafts.points', { returnObjects: true })

  return (
    <section className={s.section} id="savoir-faire" aria-label="Notre savoir-faire">
      <div className={s.visual} aria-hidden="true">
        <img
          src="/histoire.webp"
          alt=""
          className={s.visualImg}
          width="800"
          height="600"
          loading="lazy"
        />
      </div>

      <div className={s.content}>
        <p className={s.eyebrow}>{t('crafts.eyebrow')}</p>
        <h2 className={s.title}>{t('crafts.title')}</h2>
        <p className={s.text}>{t('crafts.text')}</p>

        <ul className={s.list} aria-label="Nos engagements">
          {Array.isArray(points) && points.map((item, i) => (
            <li key={i} className={s.listItem}>{item}</li>
          ))}
        </ul>

        <Link to="/contact" className={s.btnPrimary}>
          {t('crafts.cta')}
        </Link>
      </div>
    </section>
  )
}
