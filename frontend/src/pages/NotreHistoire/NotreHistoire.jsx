import { useTranslation } from 'react-i18next'
import Seo from '../../components/seo/Seo.jsx'
import s from './NotreHistoire.module.css'

export default function NotreHistoire() {
  const { t } = useTranslation()

  return (
    <main className={s.page}>
      <Seo title={t('seo.aboutTitle')} description={t('seo.aboutDesc')} />

      {/* En-tête */}
      <div className={s.hero}>
        <p className={s.eyebrow}>{t('about.eyebrow')}</p>
        <h1 className={s.title}>{t('about.title')}</h1>
        <p className={s.subtitle}>{t('about.subtitle')}</p>
      </div>

      <div className={s.content}>

        {/* Citation d'intro */}
        <blockquote className={s.pullQuote}>
          {t('about.pullQuote')}
        </blockquote>

        {/* Bloc principal */}
        <article className={s.article}>
          <section className={s.section}>
            <h2 className={s.sectionTitle}>{t('about.whoTitle')}</h2>
            <p className={s.paragraph}>{t('about.who1')}</p>
            <p className={s.paragraph}>{t('about.who2')}</p>
            <p className={s.paragraph}>{t('about.who3')}</p>
          </section>

          <div className={s.divider}>
            <span className={s.dividerSymbol}>✦</span>
          </div>

          <section className={s.section}>
            <h2 className={s.sectionTitle}>{t('about.missionTitle')}</h2>
            <p className={s.paragraph}>{t('about.mission1')}</p>
            <p className={s.paragraph}>{t('about.mission2')}</p>
          </section>

          {/* Signature */}
          <p className={s.signature}>{t('about.signature')}</p>
        </article>

        {/* Ligne chronologique */}
        <div className={s.timeline}>
          <div className={s.timelineItem}>
            <span className={s.timelineYear}>1995</span>
            <p className={s.timelineText}>{t('about.timeline1995')}</p>
          </div>
          <div className={s.timelineConnector} aria-hidden="true" />
          <div className={s.timelineItem}>
            <span className={s.timelineYear}>2026</span>
            <p className={s.timelineText}>{t('about.timeline2026')}</p>
          </div>
        </div>

      </div>
    </main>
  )
}
