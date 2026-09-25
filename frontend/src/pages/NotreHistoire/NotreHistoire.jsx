import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Seo from '../../components/seo/Seo.jsx'
import { getAboutContent } from '../../services/legal.service.js'
import s from './NotreHistoire.module.css'

export default function NotreHistoire() {
  const { t } = useTranslation()

  /* Contenu éditable depuis l'administration (ADM-08). Tant qu'un champ n'a pas
     été rempli, la page garde son texte d'origine : la boutique reste complète
     même sans aucune saisie, et une page blanche est impossible. */
  const [custom, setCustom] = useState({})
  useEffect(() => {
    getAboutContent().then(setCustom).catch(() => {})
  }, [])

  const texte = (cle, defaut) => {
    const valeur = custom[cle]
    return valeur && valeur.trim() ? valeur : defaut
  }

  /* Les sections acceptent plusieurs paragraphes, séparés par une ligne vide
     dans le champ de saisie — sans quoi un texte long s'afficherait d'un bloc. */
  const paragraphes = (cle, defauts) => {
    const valeur = custom[cle]
    if (valeur && valeur.trim()) {
      return valeur.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    }
    return defauts
  }

  const qui     = paragraphes('about_who', [t('about.who1'), t('about.who2'), t('about.who3')])
  const mission = paragraphes('about_mission', [t('about.mission1'), t('about.mission2')])

  return (
    /* <div> et non <main> : la mise en page fournit déjà le <main> de la page —
       deux zones principales imbriquées désorientent les lecteurs d'écran */
    <div className={s.page}>
      <Seo title={t('seo.aboutTitle')} description={t('seo.aboutDesc')} />

      {/* En-tête */}
      <div className={s.hero}>
        <p className={s.eyebrow}>{t('about.eyebrow')}</p>
        <h1 className={s.title}>{texte('about_title', t('about.title'))}</h1>
        <p className={s.subtitle}>{texte('about_subtitle', t('about.subtitle'))}</p>
      </div>

      <div className={s.content}>

        {/* Citation d'intro */}
        <blockquote className={s.pullQuote}>
          {texte('about_quote', t('about.pullQuote'))}
        </blockquote>

        {/* Bloc principal */}
        <article className={s.article}>
          <section className={s.section}>
            <h2 className={s.sectionTitle}>{texte('about_who_title', t('about.whoTitle'))}</h2>
            {qui.map((paragraphe, i) => (
              <p key={i} className={s.paragraph}>{paragraphe}</p>
            ))}
          </section>

          <div className={s.divider}>
            <span className={s.dividerSymbol}>✦</span>
          </div>

          <section className={s.section}>
            <h2 className={s.sectionTitle}>{texte('about_mission_title', t('about.missionTitle'))}</h2>
            {mission.map((paragraphe, i) => (
              <p key={i} className={s.paragraph}>{paragraphe}</p>
            ))}
          </section>

          {/* Signature */}
          <p className={s.signature}>{texte('about_signature', t('about.signature'))}</p>
        </article>

        {/* Ligne chronologique */}
        <div className={s.timeline}>
          <div className={s.timelineItem}>
            <span className={s.timelineYear}>{texte('about_year_1', '1995')}</span>
            <p className={s.timelineText}>{texte('about_year_1_text', t('about.timeline1995'))}</p>
          </div>
          <div className={s.timelineConnector} aria-hidden="true" />
          <div className={s.timelineItem}>
            <span className={s.timelineYear}>{texte('about_year_2', '2026')}</span>
            <p className={s.timelineText}>{texte('about_year_2_text', t('about.timeline2026'))}</p>
          </div>
        </div>

      </div>
    </div>
  )
}
