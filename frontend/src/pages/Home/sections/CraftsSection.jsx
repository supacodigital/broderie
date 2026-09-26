import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useHomeContent } from '../../../hooks/useHomeContent.js'
import { previewTarget } from '../../../utils/livePreview.js'
import s from './CraftsSection.module.css'

export default function CraftsSection() {
  const { t } = useTranslation()
  // Textes modifiables depuis Paramètres → Page d'accueil (ADM-08)
  const { text, isCustom, style } = useHomeContent()
  // Engagements saisis dans l'admin : un par ligne
  const points = isCustom('crafts_points')
    ? text('crafts_points').split('\n').map(p => p.trim()).filter(Boolean)
    : t('crafts.points', { returnObjects: true })

  return (
    <section className={s.section} id="savoir-faire" aria-label="Notre savoir-faire">
      <div className={s.visual} aria-hidden="true">
        <img
          src="/coeur-fils.webp"
          alt=""
          className={s.visualImg}
          width="800"
          height="600"
          loading="lazy"
        />
      </div>

      <div className={s.content}>
        <p className={s.eyebrow} style={style('crafts_eyebrow')} {...previewTarget('crafts_eyebrow')}>{text('crafts_eyebrow', t('crafts.eyebrow'))}</p>
        <h2 className={s.title} style={style('crafts_title')} {...previewTarget('crafts_title')}>{text('crafts_title', t('crafts.title'))}</h2>
        <p className={s.text} style={style('crafts_text')} {...previewTarget('crafts_text')}>{text('crafts_text', t('crafts.text'))}</p>

        <ul className={s.list} aria-label="Nos engagements">
          {Array.isArray(points) && points.map((item, i) => (
            <li key={i} className={s.listItem} style={style('crafts_points')} {...previewTarget('crafts_points')}>{item}</li>
          ))}
        </ul>

        <Link to="/notre-histoire" className={s.btnPrimary} style={style('crafts_cta')} {...previewTarget('crafts_cta')}>
          {text('crafts_cta', t('crafts.cta'))}
        </Link>
      </div>
    </section>
  )
}
