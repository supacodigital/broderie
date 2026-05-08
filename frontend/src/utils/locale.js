const SUPPORTED = ['fr', 'de', 'en']

/* Normalise fr-FR, fr-CH, de-CH… → fr, de, en. Fallback : 'fr' */
export function normalizeLocale(lang) {
  const code = (lang || 'fr').split('-')[0].toLowerCase()
  return SUPPORTED.includes(code) ? code : 'fr'
}
