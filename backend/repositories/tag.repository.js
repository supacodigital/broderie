const { pool } = require('../config/db');

// Tous les tags actifs avec leur traduction (boutique — filtres catalogue)
const findAll = async (locale = 'fr') => {
  const [rows] = await pool.execute(
    `SELECT t.id, t.slug, t.sort_order, tt.name
     FROM tags t
     INNER JOIN tag_translations tt ON tt.tag_id = t.id AND tt.locale = ?
     ORDER BY t.sort_order ASC, tt.name ASC`,
    [locale]
  );
  return rows;
};

module.exports = { findAll };
