const { pool } = require('../config/db');

// Toutes les catégories avec leurs traductions + comptage produits actifs
// (y compris sous-catégories et petites-sous-catégories — hiérarchie à 3 niveaux max).
// Le comptage passe par une table de fermeture (rayon → lui-même, enfants,
// petits-enfants) agrégée en un seul GROUP BY : l'ancienne sous-requête corrélée
// par rayon prenait ~2 s en production, contre ~60 ms ici, pour des totaux identiques.
const findAll = async (locale = 'fr') => {
  const [rows] = await pool.execute(
    `SELECT c.id, c.parent_id, c.slug, c.image_url, c.sort_order,
            COALESCE(ct.name, ct_fr.name) AS name,
            COALESCE(ct.description, ct_fr.description) AS description,
            COALESCE(cnt.product_count, 0) AS product_count
     FROM categories c
     LEFT JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = ?
     LEFT JOIN category_translations ct_fr ON ct_fr.category_id = c.id AND ct_fr.locale = 'fr'
     LEFT JOIN (
       SELECT closure.ancestor_id, COUNT(DISTINCT pc.product_id) AS product_count
       FROM (
         SELECT id AS ancestor_id, id AS category_id FROM categories
         UNION ALL
         SELECT parent_id, id FROM categories WHERE parent_id IS NOT NULL
         UNION ALL
         SELECT parent.parent_id, child.id
         FROM categories child
         JOIN categories parent ON parent.id = child.parent_id
         WHERE parent.parent_id IS NOT NULL
       ) closure
       -- Rattachement lu sur product_categories (ADM-04) : un produit
       -- rangé ici en rayon secondaire compte dans le total affiché.
       JOIN product_categories pc ON pc.category_id = closure.category_id
       JOIN products p ON p.id = pc.product_id AND p.is_active = 1 AND p.deleted_at IS NULL
       GROUP BY closure.ancestor_id
     ) cnt ON cnt.ancestor_id = c.id
     ORDER BY c.sort_order ASC, name ASC`,
    [locale]
  );
  return rows;
};

// Une catégorie par slug avec sa traduction (fallback FR si la locale demandée est absente)
const findBySlug = async (slug, locale = 'fr') => {
  const [rows] = await pool.execute(
    `SELECT c.id, c.parent_id, c.slug, c.image_url, c.sort_order,
            COALESCE(ct.name, ct_fr.name) AS name,
            COALESCE(ct.description, ct_fr.description) AS description
     FROM categories c
     LEFT JOIN category_translations ct ON ct.category_id = c.id AND ct.locale = ?
     LEFT JOIN category_translations ct_fr ON ct_fr.category_id = c.id AND ct_fr.locale = 'fr'
     WHERE c.slug = ?
     LIMIT 1`,
    [locale, slug]
  );
  return rows[0] || null;
};

// Arborescence seule (id + parent) — sert à résoudre les descendants d'un rayon.
// Ne jamais passer par findAll() pour cela : son comptage produits par rayon
// coûte plusieurs secondes et saturait le pool MySQL à chaque page catalogue.
const findTree = async () => {
  const [rows] = await pool.execute('SELECT id, parent_id FROM categories');
  return rows;
};

module.exports = { findAll, findBySlug, findTree };
