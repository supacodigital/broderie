const { pool } = require('../config/db');

const ALLOWED_SORT = { created_at: 'u.created_at', order_count: 'order_count' };

const findAll = async ({ page = 1, limit = 20, search = '', sort = 'created_at', order = 'desc' } = {}) => {
  const offset    = (page - 1) * limit;
  const sortField = ALLOWED_SORT[sort] || 'u.created_at';
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

  const params = [];
  let where = "WHERE u.deleted_at IS NULL AND u.role = 'client'";

  if (search) {
    /* Numéro de client imprimé sur la facture (« C000667 », ADM-17) : une cliente
       qui le cite au téléphone doit être retrouvée. « C000667 », « c667 » et
       « 667 » désignent le même compte. */
    const customerNumber = String(search).trim().match(/^c?0*(\d{1,9})$/i);
    where += ` AND (u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?${customerNumber ? ' OR u.id = ?' : ''})`;
    const term = `%${search}%`;
    params.push(term, term, term);
    if (customerNumber) params.push(Number(customerNumber[1]));
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
     -- Tentatives de paiement carte / Twint non abouties exclues (CLI-07)
     LEFT JOIN orders o ON o.user_id = u.id AND o.confirmed_at IS NOT NULL
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
    `SELECT id, email, first_name, last_name, locale, is_active, email_verified_at, created_at
     FROM users WHERE id = ? AND deleted_at IS NULL AND role = 'client' LIMIT 1`,
    [id]
  );
  if (!users[0]) return null;

  /* Requêtes indépendantes lancées ensemble : la fiche s'affiche au rythme de
     la plus lente, pas de leur somme. */
  const [[addresses], [orders], [loyaltyRows], [rewards]] = await Promise.all([
    pool.execute(
      // Destinataire et téléphone : la fiche sert aussi à rappeler la cliente
      `SELECT id, label, address_type, first_name, last_name, complement, street, street_number,
              city, zip, country, canton, phone, is_default
       FROM addresses WHERE user_id = ?
       ORDER BY is_default DESC, id ASC`,
      [id]
    ),
    pool.execute(
      // Sans les tentatives de paiement carte / Twint non abouties (CLI-07)
      `SELECT id, invoice_number, status, total, created_at FROM orders
       WHERE user_id = ? AND confirmed_at IS NOT NULL
       ORDER BY created_at DESC LIMIT 100`,
      [id]
    ),
    pool.execute(
      `SELECT la.total_spend_chf, la.updated_at AS loyalty_updated_at,
              lt.name AS tier_name, lt.min_spend_chf AS tier_min_spend,
              lt.reward_type, lt.reward_value
       FROM loyalty_accounts la
       LEFT JOIN loyalty_tiers lt ON lt.id = la.current_tier_id
       WHERE la.user_id = ? LIMIT 1`,
      [id]
    ),
    pool.execute(
      `SELECT lr.code, lr.type, lr.value, lr.status, lr.expires_at, lt.name AS tier_name
       FROM loyalty_rewards lr
       LEFT JOIN loyalty_tiers lt ON lt.id = lr.tier_id
       WHERE lr.user_id = ?
       ORDER BY lr.created_at DESC
       LIMIT 50`,
      [id]
    ),
  ]);

  const loyalty = loyaltyRows[0]
    ? { ...loyaltyRows[0], total_spend_chf: parseFloat(loyaltyRows[0].total_spend_chf ?? 0), rewards }
    : null;

  return { ...users[0], addresses, orders, loyalty };
};

/* Modification de la fiche client depuis l'admin (CLI-06) — prénom, nom et
   adresse e-mail. Comptes clients uniquement : un compte du back-office ne se
   modifie pas par cette voie.
   Le statut « adresse confirmée » est conservé : la boutique saisit l'adresse
   que la cliente lui a communiquée.
   Retour : { notFound } | { emailTaken } | { updated, emailChanged } */
const updateIdentity = async (id, { firstName, lastName, email }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[current]] = await connection.execute(
      `SELECT id, email FROM users
       WHERE id = ? AND deleted_at IS NULL AND role = 'client'
       FOR UPDATE`,
      [id]
    );
    if (!current) { await connection.rollback(); return { notFound: true }; }

    // Même règle que l'index unique uq_users_email (collation insensible à la casse)
    const [taken] = await connection.execute(
      `SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1`,
      [email, id]
    );
    if (taken.length) { await connection.rollback(); return { emailTaken: true }; }

    await connection.execute(
      `UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE id = ?`,
      [firstName, lastName, email, id]
    );

    const emailChanged = current.email.toLowerCase() !== email.toLowerCase();
    if (emailChanged) {
      /* Les liens de confirmation et de réinitialisation déjà envoyés à
         l'ancienne adresse ne doivent plus agir sur le compte. */
      await connection.execute(
        `UPDATE users SET verify_token_hash = NULL, verify_token_expires = NULL,
                          reset_token_hash = NULL, reset_token_expires = NULL
         WHERE id = ?`,
        [id]
      );

      /* L'inscription newsletter suit l'adresse : sinon « Mon profil »
         afficherait « Non » et l'ancienne adresse continuerait de la recevoir.
         Si la nouvelle adresse a déjà sa propre inscription, celle-ci prévaut. */
      const [[ownSubscription]] = await connection.execute(
        `SELECT id FROM newsletter_subscribers WHERE email = ? LIMIT 1`,
        [email]
      );
      if (!ownSubscription) {
        await connection.execute(
          `UPDATE newsletter_subscribers SET email = ? WHERE email = ?`,
          [email, current.email]
        );
      }
    }

    await connection.commit();
    return { updated: true, emailChanged };
  } catch (err) {
    await connection.rollback();
    // Adresse prise entre la vérification et l'écriture (requête concurrente)
    if (err.code === 'ER_DUP_ENTRY') return { emailTaken: true };
    throw err;
  } finally {
    connection.release();
  }
};

// Compte client existant (ni supprimé, ni compte du back-office)
const clientExists = async (id) => {
  const [rows] = await pool.execute(
    `SELECT id FROM users WHERE id = ? AND deleted_at IS NULL AND role = 'client' LIMIT 1`,
    [id]
  );
  return rows.length > 0;
};

module.exports = { findAll, findById, updateIdentity, clientExists };
