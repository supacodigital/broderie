const SUPPORTED = ['fr', 'de', 'en'];

/* Normalise fr-FR, fr-CH, de-CH… → fr, de, en. Fallback : 'fr' */
const normalizeLocale = (locale) => {
  const code = (locale || 'fr').split('-')[0].toLowerCase();
  return SUPPORTED.includes(code) ? code : 'fr';
};

module.exports = { normalizeLocale };
