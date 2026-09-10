import { Helmet } from 'react-helmet-async'
import { useLocation } from 'react-router-dom'

/* Domaine de production — sert à construire les URLs canoniques */
const SITE_URL = import.meta.env.VITE_SITE_URL ?? 'https://broderie.ch'
const SITE_NAME = 'Au Point-Compté'

/**
 * Composant SEO réutilisable — pose title, description, canonical et Open Graph
 * pour la page courante. Site 100 % francophone (marché Suisse romand).
 *
 * @param {string} title       titre de la page (sans le nom du site, ajouté automatiquement)
 * @param {string} description meta description
 * @param {string} [image]     image Open Graph (chemin absolu ou relatif au site)
 * @param {boolean} [noindex]  true pour exclure la page de l'indexation (ex: compte, checkout)
 */
function Seo({ title, description, image, noindex = false }) {
  const { pathname } = useLocation()

  const fullTitle = title ? `${title} — ${SITE_NAME}` : `${SITE_NAME} — Broderie & Arts de l'aiguille`
  const canonical = `${SITE_URL}${pathname}`
  const ogImage   = image
    ? (image.startsWith('http') ? image : `${SITE_URL}${image}`)
    : `${SITE_URL}/logo-og.jpg`

  return (
    <Helmet>
      {/* Langue du document — accessibilité + SEO */}
      <html lang="fr" />

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
      <meta property="og:locale" content="fr_CH" />
    </Helmet>
  )
}

export default Seo
