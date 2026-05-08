const { pool } = require('../config/db');

const findAll = async ({ page = 1, limit = 100 }) => {
  const offset = (page - 1) * limit;
  const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM coupons`);
  const [rows] = await pool.query(
    `SELECT id, code, type, value, min_order_chf, usage_limit, used_count, expires_at, is_active
     FROM coupons
     ORDER BY id DESC
     LIMIT ${limit} OFFSET ${offset}`
  );
  return { rows, total };
};

const findById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT id, code, type, value, min_order_chf, usage_limit, used_count, expires_at, is_active
     FROM coupons WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
};

const findByCode = async (code, excludeId = null) => {
  let query = `SELECT id FROM coupons WHERE code = ?`;
  const params = [code];
  if (excludeId) { query += ` AND id != ?`; params.push(excludeId); }
  const [rows] = await pool.execute(query, params);
  return rows[0] ?? null;
};

const create = async ({ code, type, value, minOrderChf, usageLimit, expiresAt, isActive }) => {
  const [result] = await pool.execute(
    `INSERT INTO coupons (code, type, value, min_order_chf, usage_limit, expires_at, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [code.toUpperCase(), type, value, minOrderChf ?? 0, usageLimit ?? null, expiresAt ?? null, isActive !== false ? 1 : 0]
  );
  return result.insertId;
};

const update = async (id, { code, type, value, minOrderChf, usageLimit, expiresAt, isActive }) => {
  await pool.execute(
    `UPDATE coupons
     SET code = ?, type = ?, value = ?, min_order_chf = ?, usage_limit = ?, expires_at = ?, is_active = ?
     WHERE id = ?`,
    [code.toUpperCase(), type, value, minOrderChf ?? 0, usageLimit ?? null, expiresAt ?? null, isActive ? 1 : 0, id]
  );
};

const remove = async (id) => {
  const [result] = await pool.execute(`DELETE FROM coupons WHERE id = ?`, [id]);
  return result.affectedRows > 0;
};

/* Valide un code coupon et retourne le coupon avec la réduction calculée */
const validate = async (code, orderSubtotal) => {
  const [rows] = await pool.execute(
    `SELECT id, code, type, value, min_order_chf, usage_limit, used_count, expires_at
     FROM coupons
     WHERE code = ? AND is_active = 1 LIMIT 1`,
    [code.toUpperCase()]
  );
  const coupon = rows[0] ?? null;
  if (!coupon) return { valid: false, error: 'Code invalide ou inactif.' };

  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { valid: false, error: 'Ce code promo est expiré.' };
  }
  if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
    return { valid: false, error: 'Ce code promo a atteint sa limite d\'utilisation.' };
  }
  const minOrder = parseFloat(coupon.min_order_chf ?? 0);
  if (orderSubtotal < minOrder) {
    return { valid: false, error: `Commande minimum de CHF ${minOrder.toFixed(2)} requise.` };
  }

  const discount = coupon.type === 'percent'
    ? Math.round(orderSubtotal * parseFloat(coupon.value)) / 100
    : Math.min(parseFloat(coupon.value), orderSubtotal);

  return { valid: true, coupon, discount: Math.round(discount * 20) / 20 };
};

/* Incrémente le compteur d'utilisation après application */
const incrementUsage = async (id) => {
  await pool.execute(`UPDATE coupons SET used_count = used_count + 1 WHERE id = ?`, [id]);
};

module.exports = { findAll, findById, findByCode, create, update, remove, validate, incrementUsage };
