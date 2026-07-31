const { pool } = require('../config/db');

// Tous les tags actifs avec leur traduction (boutique — filtres catalogue)
const findAll = async (locale = 'fr') => {
  const [rows] = await pool.execute(
    `SELECT t.id, t.slug, t.sort_order, COALESCE(tt.name, tt_fr.name) AS name
     FROM tags t
     LEFT JOIN tag_translations tt ON tt.tag_id = t.id AND tt.locale = ?
     LEFT JOIN tag_translations tt_fr ON tt_fr.tag_id = t.id AND tt_fr.locale = 'fr'
     ORDER BY t.sort_order ASC, name ASC`,
    [locale]
  );
  return rows;
};

module.exports = { findAll };
