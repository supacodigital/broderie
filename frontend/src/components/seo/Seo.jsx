import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'

/* Domaine de production — sert à construire les URLs canoniques et hreflang */
const SITE_URL = import.meta.env.VITE_SITE_URL ?? 'https://broderie.ch'
const SITE_NAME = 'Au Point-Compté'

/* Mappe la locale i18n (fr/de/en) vers le code hreflang adapté au marché suisse */
const HREFLANG = { fr: 'fr-CH', de: 'de-CH', en: 'en' }

/**
 * Composant SEO réutilisable — pose title, description, canonical, Open Graph
 * et balises hreflang pour la page courante. Synchronise aussi <html lang>.
 *
 * @param {string} title       titre de la page (sans le nom du site, ajouté automatiquement)
 * @param {string} description meta description
 * @param {string} [image]     image Open Graph (chemin absolu ou relatif au site)
 * @param {boolean} [noindex]  true pour exclure la page de l'indexation (ex: compte, checkout)
 */
function Seo({ title, description, image, noindex = false }) {
  const { i18n } = useTranslation()
  const { pathname } = useLocation()

  const locale   = i18n.language?.split('-')[0] || 'fr'
  const fullTitle = title ? `${title} — ${SITE_NAME}` : `${SITE_NAME} — Broderie & Arts de l'aiguille`
  const canonical = `${SITE_URL}${pathname}`
  const ogImage   = image
    ? (image.startsWith('http') ? image : `${SITE_URL}${image}`)
    : `${SITE_URL}/logobroderie.jpg`

  return (
    <Helmet>
      {/* Langue du document — accessibilité + SEO */}
      <html lang={locale} />

      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={noindex ? 'noindex, nofollow' : 'index, follow'} />
      <link rel="canonical" href={canonical} />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:url" content={canonical} />
      <meta property="og:locale" content={locale === 'fr' ? 'fr_CH' : locale === 'de' ? 'de_CH' : 'en'} />

      {/* Hreflang — même chemin, déclinaisons linguistiques (marché CH) */}
      {Object.entries(HREFLANG).map(([lng, code]) => (
        <link key={lng} rel="alternate" hrefLang={code} href={canonical} />
      ))}
      <link rel="alternate" hrefLang="x-default" href={canonical} />
    </Helmet>
  )
}

export default Seo
