const { pool } = require('../config/db');

// Journalise un choix de consentement (LPD). ip_hash déjà haché en amont — jamais l'IP en clair.
const logConsent = async ({ userId, sessionId, type, accepted, version, ipHash }) => {
  await pool.execute(
    `INSERT INTO consent_logs (user_id, session_id, type, accepted, version, ip_hash, accepted_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [userId ?? null, sessionId ?? null, type, accepted ? 1 : 0, version, ipHash]
  );
};

// Journaux de consentement d'un utilisateur — pour l'export LPD. ip_hash exclu (technique).
const findByUserId = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT type, accepted, version, accepted_at
     FROM consent_logs
     WHERE user_id = ?
     ORDER BY accepted_at ASC`,
    [userId]
  );
  return rows;
};

module.exports = { logConsent, findByUserId };
