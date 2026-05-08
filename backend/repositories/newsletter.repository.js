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

module.exports = { subscribe, unsubscribe };
