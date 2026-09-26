import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ExternalLink, Palette, Link2 } from 'lucide-react'
import {
  getHomeContent, getAboutContent, getBannerContent, getLegalContent, getEmailContent,
} from '../../services/content.service.js'
import { SECTIONS, HOME_GROUPS, ABOUT_GROUPS, LEGAL_GROUPS } from './contentSections.js'
import s from './ContentOverview.module.css'

const SHOP_URL = import.meta.env.VITE_SHOP_URL ?? ''

const keysOf = (groups) => groups.flatMap(g => g.fields.map(f => f.key))
const filled = (values, keys) => keys.filter(k => typeof values?.[k] === 'string' && values[k].trim()).length
const styledCount = (styles) => Object.keys(styles ?? {}).length

// Accord : « 0 texte personnalisé », « 1 texte personnalisé », « 3 textes personnalisés »
const plural = (n, singular, pluralForm) => (n > 1 ? pluralForm : singular)

/* État de chaque contenu : combien de textes remplacent ceux d'origine de la
   boutique, combien sont mis en forme ; pour le bandeau, ce qui est affiché. */
const STATUS = {
  home: (data) => ({
    kind: 'progress', done: filled(data, keysOf(HOME_GROUPS)), total: keysOf(HOME_GROUPS).length,
    label: ['texte personnalisé', 'textes personnalisés'], styled: styledCount(data.styles),
  }),
  about: (data) => ({
    kind: 'progress', done: filled(data, keysOf(ABOUT_GROUPS)), total: keysOf(ABOUT_GROUPS).length,
    label: ['texte personnalisé', 'textes personnalisés'], styled: styledCount(data.styles),
  }),
  legal: (data) => ({
    kind: 'progress', done: filled(data, keysOf(LEGAL_GROUPS)), total: keysOf(LEGAL_GROUPS).length,
    label: ['texte remplacé', 'textes remplacés'], styled: styledCount(data.styles),
  }),
  // Les e-mails gardent leur présentation : pas de mise en forme à compter
  emails: (data) => ({
    kind: 'progress', done: filled(data.values, ['email_welcome_text', 'email_verify_text']), total: 2,
    label: ['texte personnalisé', 'textes personnalisés'], styled: null,
  }),
  banner: (data) => {
    const text = (data.banner_text ?? '').trim()
    return {
      kind: 'banner',
      state: !text ? 'none' : data.banner_enabled === '1' ? 'on' : 'off',
      text,
      link: (data.banner_link ?? '').trim(),
      styled: styledCount(data.styles) > 0,
    }
  },
}

const BANNER_STATE = {
  on:   { label: 'En ligne', className: 'pillOn' },
  off:  { label: 'Masqué', className: 'pillOff' },
  none: { label: 'Aucune annonce', className: 'pillOff' },
}

const LOADERS = {
  home: getHomeContent, about: getAboutContent, banner: getBannerContent,
  legal: getLegalContent, emails: getEmailContent,
}

function StyledLine({ count }) {
  if (count === null) return null
  return (
    <p className={s.meta}>
      <Palette size={13} aria-hidden="true" />
      {count === 0 ? 'Aucune mise en forme' : `${count} ${plural(count, 'texte mis en forme', 'textes mis en forme')}`}
    </p>
  )
}

function ProgressStatus({ status }) {
  const { done, total, label, styled } = status
  return (
    <>
      <p className={s.metric}>
        <span className={s.metricValue}>{done}</span>
        <span className={s.metricTotal}>/ {total}</span>
        <span className={s.metricLabel}>{plural(done, ...label)}</span>
      </p>
      <div className={s.bar} aria-hidden="true">
        <span className={s.barFill} style={{ transform: `scaleX(${total ? done / total : 0})` }} />
      </div>
      <StyledLine count={styled} />
    </>
  )
}

function BannerStatus({ status }) {
  const { state, text, link, styled } = status
  const pill = BANNER_STATE[state]
  return (
    <>
      <span className={`${s.pill} ${s[pill.className]}`}>
        <span className={s.pillDot} aria-hidden="true" /> {pill.label}
      </span>
      {text && (
        /* Le bandeau en miniature, tel qu'il apparaît en haut de la boutique ;
           estompé quand il est masqué */
        <p className={`${s.miniBanner} ${state === 'off' ? s.miniBannerOff : ''}`}>{text}</p>
      )}
      {(link || styled) && (
        <div className={s.metaRow}>
          {link && <p className={s.meta}><Link2 size={13} aria-hidden="true" /> {link}</p>}
          {styled && <p className={s.meta}><Palette size={13} aria-hidden="true" /> Mise en forme personnalisée</p>}
        </div>
      )}
    </>
  )
}

/* Tableau de bord du super-administrateur : une carte par contenu, avec son
   état. Toute la carte mène à l'éditeur ; « Voir sur la boutique » à part. */
export default function ContentOverview() {
  const [states, setStates] = useState({})

  const load = useCallback(async () => {
    setStates({})
    // Chargées en parallèle : une page en erreur n'empêche pas les autres de s'afficher
    const results = await Promise.allSettled(SECTIONS.map(sec => LOADERS[sec.page]()))
    setStates(Object.fromEntries(SECTIONS.map((sec, i) => [
      sec.page,
      results[i].status === 'fulfilled' ? { status: STATUS[sec.page](results[i].value) } : { error: true },
    ])))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className={s.grid}>
      {SECTIONS.map(sec => {
        const Icon = sec.icon
        const state = states[sec.page]
        return (
          <article key={sec.slug} className={`${s.card} ${sec.page === 'banner' ? s.cardWide : ''}`}>
            <div className={s.head}>
              <span className={s.icon} aria-hidden="true"><Icon size={18} /></span>
              {sec.shopPath && (
                <a
                  href={`${SHOP_URL}${sec.shopPath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={s.shopLink}
                  aria-label={`Voir « ${sec.label} » sur la boutique (nouvel onglet)`}
                  title="Voir sur la boutique"
                >
                  <ExternalLink size={15} aria-hidden="true" />
                </a>
              )}
            </div>

            <div className={s.text}>
              {/* Lien étiré : toute la carte est cliquable, un seul lien pour les lecteurs d'écran */}
              <h2 className={s.title}>
                <Link to={`/contenu/${sec.slug}`} className={s.cardLink}>{sec.label}</Link>
              </h2>
              <p className={s.desc}>{sec.desc}</p>
            </div>

            <div className={s.status} aria-live="polite">
              {!state && (
                <>
                  <span className={s.skeleton} style={{ width: '45%', height: 22 }} />
                  <span className={s.skeleton} style={{ width: '100%', height: 6 }} />
                </>
              )}
              {state?.error && (
                <p className={s.error}>
                  Impossible de charger l’état.{' '}
                  <button type="button" className={s.retry} onClick={load}>Réessayer</button>
                </p>
              )}
              {state?.status?.kind === 'progress' && <ProgressStatus status={state.status} />}
              {state?.status?.kind === 'banner' && <BannerStatus status={state.status} />}
            </div>

            <span className={s.cta} aria-hidden="true">
              Modifier <ArrowRight size={14} className={s.ctaArrow} />
            </span>
          </article>
        )
      })}
    </div>
  )
}
