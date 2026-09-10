/* Site 100 % francophone (marché Suisse romand). Les fonctions restent en place
   pour ne pas toucher tous leurs appelants et faciliter un futur ajout de langue,
   mais elles renvoient toujours 'fr' aujourd'hui. */
const SUPPORTED = ['fr'];

const normalizeLocale = () => 'fr';

const localeFromRequest = () => 'fr';

module.exports = { normalizeLocale, localeFromRequest, SUPPORTED };
