const { pool } = require('../config/db');

/* ============================================================
 * Rattachement des produits aux catégories (relation n-n) — ticket ADM-04
 *
 * `products.category_id` reste la catégorie PRINCIPALE (fil d'Ariane, URL
 * canonique, index composites de la boutique). Cette table porte en plus les
 * rayons secondaires, et duplique la catégorie principale avec is_primary = 1
 * pour qu'une seule requête liste tous les rayons d'un produit.
 * ============================================================ */

// Toutes les catégories rattachées à PLUSIEURS produits, en une requête.
// Utilisé pour les listes : jamais d'appel par produit dans une boucle.
const findByProductIds = async (productIds, locale = 'fr') => {
  if (!productIds || productIds.length === 0) return [];
  const placeholders = productIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT pc.product_id, pc.category_id, pc.is_primary, pc.sort_order,
            c.slug AS category_slug, c.parent_id,
            COALESCE(ct.name, ct_fr.name) AS category_name
     FROM product_categories pc
     JOIN categories c ON c.id = pc.category_id
     LEFT JOIN category_translations ct ON ct.category_id = pc.category_id AND ct.locale = ?
     LEFT JOIN category_translations ct_fr ON ct_fr.category_id = pc.category_id AND ct_fr.locale = 'fr'
     WHERE pc.product_id IN (${placeholders})
     ORDER BY pc.is_primary DESC, pc.sort_order ASC, category_name ASC`,
    [locale, ...productIds]
  );
  return rows;
};

// Les rayons d'un seul produit (fiche produit, formulaire d'administration)
const findByProductId = async (productId, locale = 'fr') =>
  findByProductIds([productId], locale);

/* Réécrit l'ensemble des rattachements d'un produit.
 *
 * `categoryIds` liste les rayons SECONDAIRES ; la catégorie principale est
 * passée séparément et toujours réinsérée avec is_primary = 1. Le remplacement
 * intégral évite d'avoir à calculer un différentiel et garantit qu'il ne reste
 * jamais deux catégories principales.
 *
 * `connection` permet de participer à une transaction ouverte par l'appelant
 * (mise à jour produit) ; sans elle, la fonction ouvre la sienne.
 */
const replaceForProduct = async (productId, primaryCategoryId, categoryIds = [], connection = null) => {
  const conn = connection || await pool.getConnection();
  const ownsTransaction = !connection;

  try {
    if (ownsTransaction) await conn.beginTransaction();

    await conn.execute('DELETE FROM product_categories WHERE product_id = ?', [productId]);

    // Doublons et rappel de la catégorie principale écartés : la clé primaire
    // (product_id, category_id) interdit de toute façon la ligne en double.
    const secondaries = [...new Set(
      (categoryIds || []).filter((id) => Number(id) && Number(id) !== Number(primaryCategoryId))
    )];

    const rows = [];
    if (primaryCategoryId) rows.push([productId, primaryCategoryId, 1, 0]);
    secondaries.forEach((id, index) => rows.push([productId, id, 0, index + 1]));

    if (rows.length > 0) {
      // Insertion groupée — un seul aller-retour SQL quel que soit le nombre de rayons
      const placeholders = rows.map(() => '(?, ?, ?, ?)').join(', ');
      await conn.query(
        `INSERT INTO product_categories (product_id, category_id, is_primary, sort_order)
         VALUES ${placeholders}`,
        rows.flat()
      );
    }

    if (ownsTransaction) await conn.commit();
  } catch (error) {
    if (ownsTransaction) await conn.rollback();
    throw error;
  } finally {
    if (ownsTransaction) conn.release();
  }
};

module.exports = { findByProductIds, findByProductId, replaceForProduct };
