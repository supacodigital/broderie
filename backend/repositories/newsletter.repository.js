const { pool } = require('../config/db');

/* Délai minimal entre deux e-mails de confirmation pour une même adresse : sans
   lui, le formulaire public permettait d'inonder une boîte de demandes répétées. */
const CONFIRMATION_RESEND_MINUTES = 10;

/* Demande d'inscription depuis le formulaire du site — double opt-in (CLI-05).
   L'inscription reste INACTIVE tant que la personne n'a pas cliqué sur le lien
   reçu par e-mail : sans cela, n'importe qui pouvait abonner l'adresse d'un tiers,
   et la boutique n'avait aucune preuve du consentement.
   Retourne l'action à mener :
   - { sendConfirmation: true }  → envoyer l'e-mail de confirmation ;
   - { sendConfirmation: false } → déjà abonnée, ou demande trop récente.
   L'appelant répond le même message dans tous les cas : le formulaire ne doit
   pas révéler si une adresse est abonnée. */
const requestSubscription = async (email, locale = 'fr') => {
  const [[existing]] = await pool.execute(
    `SELECT id, is_active,
            subscribed_at > (NOW() - INTERVAL ? MINUTE) AS recently_requested
     FROM newsletter_subscribers WHERE email = ? LIMIT 1`,
    [CONFIRMATION_RESEND_MINUTES, email]
  );

  if (existing?.is_active) return { sendConfirmation: false };
  if (existing?.recently_requested) return { sendConfirmation: false };

  if (existing) {
    // Demande renouvelée (jamais confirmée, ou désabonnée depuis) : reste inactive
    await pool.execute(
      `UPDATE newsletter_subscribers
       SET locale = ?, source = 'form', subscribed_at = NOW()
       WHERE id = ?`,
      [locale, existing.id]
    );
  } else {
    await pool.execute(
      `INSERT INTO newsletter_subscribers (email, locale, source, is_active) VALUES (?, ?, 'form', 0)`,
      [email, locale]
    );
  }
  return { sendConfirmation: true };
};

/* Clic sur le lien de confirmation reçu par e-mail : l'inscription devient
   effective et la date du consentement est conservée (preuve).
   Une personne désabonnée qui refait une demande PUIS la confirme est réabonnée :
   c'est un nouveau consentement explicite. */
const confirmSubscription = async (email) => {
  const [result] = await pool.execute(
    `UPDATE newsletter_subscribers
     SET is_active = 1, confirmed_at = NOW(), unsubscribed_at = NULL
     WHERE email = ? AND is_active = 0`,
    [email]
  );
  if (result.affectedRows > 0) return { confirmed: true };

  const [[row]] = await pool.execute(
    `SELECT is_active FROM newsletter_subscribers WHERE email = ? LIMIT 1`,
    [email]
  );
  return row?.is_active ? { alreadyActive: true } : { notFound: true };
};

/* Pré-inscription en attente de confirmation (double opt-in).
   L'abonnement est créé inactif : il ne devient effectif qu'une fois l'adresse
   e-mail vérifiée, via confirmPending(). On n'écrase jamais un abonnement déjà
   actif, ni un désabonnement volontaire plus récent que la demande. */
const subscribePending = async (email, locale = 'fr') => {
  const [existing] = await pool.execute(
    `SELECT id, is_active FROM newsletter_subscribers WHERE email = ? LIMIT 1`,
    [email]
  );
  if (existing[0]) return { alreadyKnown: true };

  await pool.execute(
    `INSERT INTO newsletter_subscribers (email, locale, source, is_active) VALUES (?, ?, 'account', 0)`,
    [email, locale]
  );
  return { pending: true };
};

/* Active une pré-inscription au moment où l'adresse e-mail est confirmée.
   Ne touche qu'aux lignes encore inactives et jamais désabonnées : quelqu'un qui
   s'est désinscrit entre-temps ne doit pas être réabonné par une confirmation tardive.
   `subscribed_at` garde la date de la demande ; `confirmed_at` date le consentement. */
const confirmPending = async (email) => {
  const [result] = await pool.execute(
    `UPDATE newsletter_subscribers
     SET is_active = 1, confirmed_at = NOW()
     WHERE email = ? AND is_active = 0 AND unsubscribed_at IS NULL`,
    [email]
  );
  return result.affectedRows > 0;
};

/* Choix « Newsletter : Oui » depuis le compte client (CLI-05).
   - adresse vérifiée : inscription immédiate, consentement daté — l'adresse est
     prouvée et le choix est fait dans l'espace connecté de la cliente ;
   - adresse non vérifiée : demande en attente, activée à la vérification
     (confirmPending), y compris après un désabonnement antérieur. */
const subscribeFromAccount = async (email, { verified }, locale = 'fr') => {
  const [[existing]] = await pool.execute(
    `SELECT id, is_active FROM newsletter_subscribers WHERE email = ? LIMIT 1`,
    [email]
  );
  if (existing?.is_active) return { status: 'subscribed' };

  if (verified) {
    if (existing) {
      await pool.execute(
        `UPDATE newsletter_subscribers
         SET is_active = 1, source = 'account', subscribed_at = NOW(), confirmed_at = NOW(), unsubscribed_at = NULL
         WHERE id = ?`,
        [existing.id]
      );
    } else {
      await pool.execute(
        `INSERT INTO newsletter_subscribers (email, locale, source, is_active, confirmed_at)
         VALUES (?, ?, 'account', 1, NOW())`,
        [email, locale]
      );
    }
    return { status: 'subscribed' };
  }

  if (existing) {
    await pool.execute(
      `UPDATE newsletter_subscribers
       SET source = 'account', subscribed_at = NOW(), unsubscribed_at = NULL
       WHERE id = ?`,
      [existing.id]
    );
  } else {
    await pool.execute(
      `INSERT INTO newsletter_subscribers (email, locale, source, is_active) VALUES (?, ?, 'account', 0)`,
      [email, locale]
    );
  }
  return { status: 'pending' };
};

/* Choix « Newsletter : Non » depuis le compte : désinscrit, et annule une demande
   en attente — sans quoi une vérification d'adresse ultérieure la réactiverait. */
const unsubscribeFromAccount = async (email) => {
  await pool.execute(
    `UPDATE newsletter_subscribers SET is_active = 0, unsubscribed_at = NOW()
     WHERE email = ? AND (is_active = 1 OR unsubscribed_at IS NULL)`,
    [email]
  );
  return { status: 'none' };
};

// État affiché dans le compte : abonnée, en attente de vérification, ou non abonnée
const findStatusByEmail = async (email) => {
  const [[row]] = await pool.execute(
    `SELECT is_active, unsubscribed_at FROM newsletter_subscribers WHERE email = ? LIMIT 1`,
    [email]
  );
  if (!row) return 'none';
  if (row.is_active) return 'subscribed';
  return row.unsubscribed_at ? 'none' : 'pending';
};

// Pré-inscription en attente pour cette adresse ? (annoncée dans l'e-mail de vérification)
const hasPendingSubscription = async (email) => {
  const [[row]] = await pool.execute(
    `SELECT id FROM newsletter_subscribers
     WHERE email = ? AND is_active = 0 AND unsubscribed_at IS NULL LIMIT 1`,
    [email]
  );
  return !!row;
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
    `SELECT id, email, locale, source, is_active, subscribed_at, confirmed_at, unsubscribed_at
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

// État d'abonnement d'une adresse — pour l'export LPD
const findByEmail = async (email) => {
  const [rows] = await pool.execute(
    `SELECT email, locale, source, is_active, subscribed_at, confirmed_at, unsubscribed_at
     FROM newsletter_subscribers
     WHERE email = ?
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
};

// Désabonnement manuel par l'admin (soft delete)
const unsubscribeById = async (id) => {
  const [result] = await pool.execute(
    `UPDATE newsletter_subscribers SET is_active = 0, unsubscribed_at = NOW() WHERE id = ?`,
    [id]
  );
  return result.affectedRows > 0;
};

module.exports = {
  subscribePending,
  confirmPending,
  hasPendingSubscription,
  requestSubscription,
  confirmSubscription,
  subscribeFromAccount,
  unsubscribeFromAccount,
  findStatusByEmail,
  unsubscribe,
  findAll,
  findByEmail,
  unsubscribeById,
};
