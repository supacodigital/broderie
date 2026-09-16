const { pool } = require('../config/db');

/* Journal des recherches sans résultat — aucune donnée personnelle stockée.
   Voir services/searchLog.service.js et la migration du 2026-09-16. */

/* Incrémente le compteur d'un terme, ou crée la ligne à la première occurrence.
   « ON DUPLICATE KEY UPDATE » sur l'index unique (term, locale) : une seule
   requête, et deux recherches simultanées du même terme ne peuvent pas créer
   de doublon ni écraser le compteur l'une de l'autre.
   `last_seen_at` est mis à jour automatiquement par la colonne (ON UPDATE). */
const incrementNoResult = async (term, locale = 'fr') => {
  await pool.execute(
    `INSERT INTO search_no_results (term, locale, search_count)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE search_count = search_count + 1`,
    [term, locale]
  );
};

// Termes les plus cherchés sans résultat — listés pour l'administration
const findNoResults = async ({ page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;

  const [countRows] = await pool.execute(
    'SELECT COUNT(*) AS total FROM search_no_results'
  );

  // pool.query (et non execute) : LIMIT/OFFSET en paramètres préparés sont
  // refusés par MySQL dans certaines versions — même pattern que product.repository
  const [rows] = await pool.query(
    `SELECT id, term, locale, search_count, first_seen_at, last_seen_at
     FROM search_no_results
     ORDER BY search_count DESC, last_seen_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  return { rows, total: countRows[0].total };
};

/* Purge de rétention — supprime les termes non revus depuis N mois.
   Appelée par l'entretien périodique ; la valeur par défaut correspond à la
   rétention annoncée dans la migration. */
const purgeOlderThanMonths = async (months = 12) => {
  const [result] = await pool.execute(
    'DELETE FROM search_no_results WHERE last_seen_at < NOW() - INTERVAL ? MONTH',
    [months]
  );
  return result.affectedRows;
};

module.exports = { incrementNoResult, findNoResults, purgeOlderThanMonths };
