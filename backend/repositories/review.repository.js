const { pool } = require('../config/db');

// Avis approuvés d'un produit (public)
const findApprovedByProduct = async (productId, { page = 1, limit = 20 }) => {
  const offset = (page - 1) * limit;

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM reviews WHERE product_id = ? AND is_approved = 1`,
    [productId]
  );
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT r.id, r.rating, r.title, r.body, r.created_at,
            u.first_name, u.last_name
     FROM reviews r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.product_id = ? AND r.is_approved = 1
     ORDER BY r.created_at DESC
     LIMIT ? OFFSET ?`,
    [productId, limit, offset]
  );

  return { rows, total };
};

// Avis approuvés récents (public — page d'accueil)
const findApproved = async ({ limit = 3, rating = null }) => {
  const params = [];
  let where = 'WHERE r.is_approved = 1';

  if (rating) {
    where += ' AND r.rating = ?';
    params.push(rating);
  }

  const [rows] = await pool.query(
    `SELECT r.id, r.rating, r.title, r.body, r.created_at,
            u.first_name, u.last_name
     FROM reviews r
     INNER JOIN users u ON u.id = r.user_id
     ${where}
     ORDER BY r.created_at DESC
     LIMIT ?`,
    [...params, limit]
  );

  return rows;
};

// Tous les avis pour l'admin (approuvés + en attente)
const findAll = async ({ page = 1, limit = 20, approved = null }) => {
  const offset = (page - 1) * limit;
  const params = [];
  let where = '';

  if (approved !== null) {
    where = 'WHERE r.is_approved = ?';
    params.push(approved ? 1 : 0);
  }

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM reviews r ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT r.id, r.rating, r.title, r.body, r.is_approved, r.created_at,
            u.first_name, u.last_name, u.email,
            pt.name AS product_name
     FROM reviews r
     INNER JOIN users u ON u.id = r.user_id
     INNER JOIN product_translations pt ON pt.product_id = r.product_id AND pt.locale = 'fr'
     ${where}
     ORDER BY r.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total };
};

// Création d'un avis (client)
const create = async ({ userId, productId, rating, title, body }) => {
  const [result] = await pool.execute(
    `INSERT INTO reviews (user_id, product_id, rating, title, body, is_approved)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [userId, productId, rating, title || null, body || null]
  );
  return result.insertId;
};

// Approbation d'un avis
const approve = async (id) => {
  await pool.execute(
    `UPDATE reviews SET is_approved = 1 WHERE id = ?`,
    [id]
  );
};

// Suppression d'un avis
const remove = async (id) => {
  const [result] = await pool.execute(
    `DELETE FROM reviews WHERE id = ?`,
    [id]
  );
  return result.affectedRows > 0;
};

module.exports = { findApprovedByProduct, findApproved, findAll, create, approve, remove };
