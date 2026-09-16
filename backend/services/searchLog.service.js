const searchLogRepository = require('../repositories/searchLog.repository');

/* Journal des recherches sans résultat — ce que les clientes cherchent en vain.

   Aucune donnée personnelle n'est enregistrée : ni identifiant, ni session, ni IP.
   Seul le terme et son nombre d'occurrences sont conservés (voir la migration
   2026-09-16_search_no_results_log.sql pour le détail du choix LPD).

   L'enregistrement est best-effort et ne doit JAMAIS faire échouer une recherche :
   la cliente attend ses résultats, pas la réussite d'une statistique. */

// Longueur max stockée — alignée sur la colonne VARCHAR(100)
const MAX_TERM_LENGTH = 100;
// En deçà, le terme n'apprend rien (« a », « ab ») ; au-delà, c'est un copier-coller
const MIN_TERM_LENGTH = 2;

/* Motifs de données personnelles écartés avant insertion.
   Une cliente qui se trompe de champ — ou qui colle un e-mail dans la recherche —
   ne doit pas laisser ses coordonnées dans la table. Le filtre est volontairement
   large : un faux positif fait perdre une statistique, un faux négatif crée une
   donnée personnelle non consentie. */
const PERSONAL_DATA_PATTERNS = [
  /[\w.+-]+@[\w-]+\.[\w.]+/,            // adresse e-mail
  /(?:\+41|0041|0)\s*\d{2}[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/, // téléphone suisse
  /\bCH\d{2}[\s]?[\dA-Z]{4}/i,          // IBAN suisse
  /\b\d{3}\.\d{4}\.\d{4}\.\d{2}\b/,     // n° AVS suisse (756.xxxx.xxxx.xx)
  /\b\d{13,}\b/,                        // longue suite de chiffres (carte, AVS collé)
];

const containsPersonalData = (term) =>
  PERSONAL_DATA_PATTERNS.some((pattern) => pattern.test(term));

/* Normalise la saisie : minuscules et espaces réduits, pour que « Coton  MOULINÉ »
   et « coton mouliné » comptent comme un seul et même terme. L'accent est conservé —
   c'est le mot réellement cherché qui intéresse la cliente du magasin. */
const normalizeTerm = (raw) =>
  String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .slice(0, MAX_TERM_LENGTH);

/* Enregistre un terme resté sans résultat.
   Retourne true si la ligne a été comptabilisée, false si le terme a été écarté
   (trop court, ou ressemblant à une donnée personnelle). */
const recordNoResult = async (rawTerm, locale = 'fr') => {
  const term = normalizeTerm(rawTerm);

  if (term.length < MIN_TERM_LENGTH) return false;
  if (containsPersonalData(term)) return false;

  try {
    await searchLogRepository.incrementNoResult(term, locale);
    return true;
  } catch (err) {
    // Une statistique perdue ne justifie pas de casser la recherche de la cliente
    console.error('[Recherche] Journalisation impossible :', err.message);
    return false;
  }
};

// Termes les plus cherchés sans résultat — pour l'administration
const getNoResultTerms = async ({ page = 1, limit = 20 } = {}) => {
  const { rows, total } = await searchLogRepository.findNoResults({ page, limit });
  return {
    data: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

module.exports = {
  recordNoResult,
  getNoResultTerms,
  // Exportés pour les tests unitaires
  normalizeTerm,
  containsPersonalData,
};
