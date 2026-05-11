const { pool } = require('../config/db');

// Abonnement newsletter — INSERT IGNORE si déjà inscrit
const subscribe = async (email, locale = 'fr') => {
  // Réactiver si déjà inscrit mais désabonné
  const [existing] = await pool.execute(
    `SELECT id, is_active FROM newsletter_subscribers WHERE email = ? LIMIT 1`,
    [email]
  );

  if (existing[0]) {
    if (existing[0].is_active) return { alreadySubscribed: true };
    await pool.execute(
      `UPDATE newsletter_subscribers SET is_active = 1, unsubscribed_at = NULL, locale = ? WHERE email = ?`,
      [locale, email]
    );
    return { reactivated: true };
  }

  await pool.execute(
    `INSERT INTO newsletter_subscribers (email, locale) VALUES (?, ?)`,
    [email, locale]
  );
  return { created: true };
};

// Désabonnement
const unsubscribe = async (email) => {
  const [result] = await pool.execute(
    `UPDATE newsletter_subscribers SET is_active = 0, unsubscribed_at = NOW()
     WHERE email = ? AND is_active = 1`,
    [email]
  );
  return result.affectedRows > 0;
};

// Liste paginée pour l'admin
const findAll = async ({ page = 1, limit = 20, search = '', active }) => {
  const offset = (Number(page) - 1) * Number(limit);
  const like   = `%${search}%`;

  const params = [like];
  // LIMIT/OFFSET interpolés car mysql2 ne supporte pas les placeholders ? pour ces clauses
  let whereActive = '';
  if (active === '1' || active === '0') {
    whereActive = ' AND is_active = ?';
    params.push(Number(active));
  }

  const [rows] = await pool.execute(
    `SELECT id, email, locale, is_active, subscribed_at, unsubscribed_at
     FROM newsletter_subscribers
     WHERE email LIKE ?${whereActive}
     ORDER BY subscribed_at DESC
     LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    params
  );

  const countParams = [like];
  if (active === '1' || active === '0') countParams.push(Number(active));
  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM newsletter_subscribers WHERE email LIKE ?${whereActive}`,
    countParams
  );

  return { rows, total };
};

// Désabonnement manuel par l'admin (soft delete)
const unsubscribeById = async (id) => {
  const [result] = await pool.execute(
    `UPDATE newsletter_subscribers SET is_active = 0, unsubscribed_at = NOW() WHERE id = ?`,
    [id]
  );
  return result.affectedRows > 0;
};

module.exports = { subscribe, unsubscribe, findAll, unsubscribeById };
