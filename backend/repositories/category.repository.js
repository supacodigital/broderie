const { pool } = require('../config/db');

// Toutes les catégories avec leurs traductions + comptage produits actifs (y compris sous-catégories)
const findAll = async (locale = 'fr') => {
  const [rows] = await pool.execute(
    `SELECT c.id, c.parent_id, c.slug, c.image_url, c.sort_order,
            ct.name, ct.description,
            (
              SELECT COUNT(p.id)
              FROM products p
              WHERE p.is_active = 1 AND p.deleted_at IS NULL
                AND (p.category_id = c.id OR p.category_id IN (
                  SELECT child.id FROM categories child WHERE child.parent_id = c.id
                ))
            ) AS product_count
     FROM categories c
     INNER JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = ?
     ORDER BY c.sort_order ASC, ct.name ASC`,
    [locale]
  );
  return rows;
};

// Une catégorie par slug avec sa traduction
const findBySlug = async (slug, locale = 'fr') => {
  const [rows] = await pool.execute(
    `SELECT c.id, c.parent_id, c.slug, c.image_url, c.sort_order,
            ct.name, ct.description
     FROM categories c
     INNER JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = ?
     WHERE c.slug = ?
     LIMIT 1`,
    [locale, slug]
  );
  return rows[0] || null;
};

module.exports = { findAll, findBySlug };
