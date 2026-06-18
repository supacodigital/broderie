const SUPPORTED = ['fr', 'de', 'en'];

/* Normalise fr-FR, fr-CH, de-CH… → fr, de, en. Fallback : 'fr' */
const normalizeLocale = (locale) => {
  const code = (locale || 'fr').split('-')[0].toLowerCase();
  return SUPPORTED.includes(code) ? code : 'fr';
};

/* Déduit la locale d'une requête : compte connecté > ?locale > en-tête Accept-Language > 'fr'.
   Utilisé pour afficher les traductions produit (panier, commande) dans la langue du client. */
const localeFromRequest = (req) => {
  const fromUser   = req.user?.locale;
  const fromQuery  = req.query?.locale;
  const fromHeader = req.headers?.['accept-language'];
  return normalizeLocale(fromUser || fromQuery || fromHeader);
};

module.exports = { normalizeLocale, localeFromRequest };
