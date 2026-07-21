const { pool } = require('../config/db');

const ALLOWED_SORT = { created_at: 'u.created_at', order_count: 'order_count' };

const findAll = async ({ page = 1, limit = 20, search = '', sort = 'created_at', order = 'desc' } = {}) => {
  const offset    = (page - 1) * limit;
  const sortField = ALLOWED_SORT[sort] || 'u.created_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

  const params = [];
  let where = "WHERE u.deleted_at IS NULL AND u.role = 'client'";

  if (search) {
    where += ' AND (u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM users u ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.locale, u.is_active, u.created_at,
            COUNT(o.id) AS order_count
     FROM users u
     LEFT JOIN orders o ON o.user_id = u.id
     ${where}
     GROUP BY u.id
     ORDER BY ${sortField} ${sortOrder}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { rows, total };
};

const findById = async (id) => {
  const [users] = await pool.execute(
    `SELECT id, email, first_name, last_name, locale, is_active, created_at
     FROM users WHERE id = ? AND deleted_at IS NULL AND role = 'client' LIMIT 1`,
    [id]
  );
  if (!users[0]) return null;

  const [addresses] = await pool.execute(
    `SELECT id, label, street, street_number, city, zip, country, canton, is_default
     FROM addresses WHERE user_id = ?`,
    [id]
  );

  const [orders] = await pool.execute(
    `SELECT id, status, total, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
    [id]
  );

  const [loyaltyRows] = await pool.execute(
    `SELECT la.total_spend_chf, la.updated_at AS loyalty_updated_at,
            lt.name AS tier_name, lt.min_spend_chf AS tier_min_spend,
            lt.reward_type, lt.reward_value
     FROM loyalty_accounts la
     LEFT JOIN loyalty_tiers lt ON lt.id = la.current_tier_id
     WHERE la.user_id = ? LIMIT 1`,
    [id]
  );

  const [rewards] = await pool.execute(
    `SELECT lr.code, lr.type, lr.value, lr.status, lr.expires_at, lt.name AS tier_name
     FROM loyalty_rewards lr
     LEFT JOIN loyalty_tiers lt ON lt.id = lr.tier_id
     WHERE lr.user_id = ?
     ORDER BY lr.created_at DESC`,
    [id]
  );

  const loyalty = loyaltyRows[0]
    ? { ...loyaltyRows[0], total_spend_chf: parseFloat(loyaltyRows[0].total_spend_chf ?? 0), rewards }
    : null;

  return { ...users[0], addresses, orders, loyalty };
};

module.exports = { findAll, findById };
