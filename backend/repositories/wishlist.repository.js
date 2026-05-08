const { pool } = require('../config/db');

// Wishlist complète d'un utilisateur avec infos produit
const findByUser = async (userId, locale = 'fr') => {
  const [rows] = await pool.execute(
    `SELECT w.id, w.product_id, w.created_at,
            pt.name AS product_name,
            p.price_chf, p.compare_price_chf, p.slug,
            p.stock, p.is_active,
            pi.url AS image_url
     FROM wishlists w
     INNER JOIN products p ON p.id = w.product_id AND p.deleted_at IS NULL
     INNER JOIN product_translations pt ON pt.product_id = w.product_id AND pt.locale = ?
     LEFT JOIN product_images pi ON pi.product_id = w.product_id AND pi.is_primary = 1
     WHERE w.user_id = ?
     ORDER BY w.created_at DESC`,
    [locale, userId]
  );
  return rows;
};

// Vérifie si un produit est dans la wishlist
const exists = async (userId, productId) => {
  const [rows] = await pool.execute(
    `SELECT id FROM wishlists WHERE user_id = ? AND product_id = ? LIMIT 1`,
    [userId, productId]
  );
  return rows.length > 0;
};

// Ajoute un produit à la wishlist
const add = async (userId, productId) => {
  const [result] = await pool.execute(
    `INSERT IGNORE INTO wishlists (user_id, product_id) VALUES (?, ?)`,
    [userId, productId]
  );
  return result.affectedRows > 0;
};

// Supprime un produit de la wishlist
const remove = async (userId, productId) => {
  const [result] = await pool.execute(
    `DELETE FROM wishlists WHERE user_id = ? AND product_id = ?`,
    [userId, productId]
  );
  return result.affectedRows > 0;
};

module.exports = { findByUser, exists, add, remove };
