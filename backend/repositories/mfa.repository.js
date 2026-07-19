const { pool } = require('../config/db');

// ── user_mfa ──

// Recherche la ligne MFA d'un utilisateur (secret chiffré + statut)
const findByUserId = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT id, user_id, secret_encrypted, secret_iv, secret_auth_tag, enabled_at,
            last_used_at, failed_attempts, locked_until
     FROM user_mfa
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
};

// Crée ou remplace le secret en attente de confirmation (enabled_at repart à NULL —
// permet de relancer un setup si l'utilisateur ferme l'onglet avant de scanner le QR)
const upsertPendingSecret = async (userId, { ciphertext, iv, authTag }) => {
  await pool.execute(
    `INSERT INTO user_mfa (user_id, secret_encrypted, secret_iv, secret_auth_tag)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       secret_encrypted = VALUES(secret_encrypted),
       secret_iv = VALUES(secret_iv),
       secret_auth_tag = VALUES(secret_auth_tag),
       enabled_at = NULL,
       failed_attempts = 0,
       locked_until = NULL`,
    [userId, ciphertext, iv, authTag]
  );
};

// Confirme l'activation après vérification du premier code TOTP
const markEnabled = async (userId) => {
  await pool.execute(
    `UPDATE user_mfa SET enabled_at = NOW() WHERE user_id = ?`,
    [userId]
  );
};

// Connexion réussie — met à jour last_used_at et réinitialise le compteur d'échecs
const recordSuccess = async (userId) => {
  await pool.execute(
    `UPDATE user_mfa SET last_used_at = NOW(), failed_attempts = 0, locked_until = NULL WHERE user_id = ?`,
    [userId]
  );
};

// Échec de vérification — incrémente le compteur, verrouille 15 min à partir de 5 échecs
const recordFailure = async (userId) => {
  await pool.execute(
    `UPDATE user_mfa
     SET failed_attempts = failed_attempts + 1,
         locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL 15 MINUTE ELSE locked_until END
     WHERE user_id = ?`,
    [userId]
  );
};

// ── user_mfa_recovery_codes ──

// Insertion batch des codes de récupération (hachés) générés au setup ou à la régénération
const insertRecoveryCodes = async (userId, codeHashes) => {
  if (codeHashes.length === 0) return;
  const placeholders = codeHashes.map(() => '(?, ?)').join(', ');
  const values = codeHashes.flatMap((hash) => [userId, hash]);
  await pool.execute(
    `INSERT INTO user_mfa_recovery_codes (user_id, code_hash) VALUES ${placeholders}`,
    values
  );
};

// Récupère les codes non utilisés d'un utilisateur (comparaison bcrypt faite en mémoire
// côté service — impossible d'indexer une recherche sur un hash bcrypt salé)
const findUnusedRecoveryCodes = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT id, code_hash FROM user_mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL`,
    [userId]
  );
  return rows;
};

// Marque un code de récupération précis comme utilisé (usage unique)
const markRecoveryCodeUsed = async (id) => {
  await pool.execute(
    `UPDATE user_mfa_recovery_codes SET used_at = NOW() WHERE id = ?`,
    [id]
  );
};

// Compte les codes encore disponibles (affichage page Sécurité, alerte stock bas)
const countUnusedRecoveryCodes = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM user_mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL`,
    [userId]
  );
  return rows[0].count;
};

// Supprime tous les codes d'un utilisateur (avant régénération, ou reset de secours)
const deleteRecoveryCodesByUserId = async (userId) => {
  await pool.execute(`DELETE FROM user_mfa_recovery_codes WHERE user_id = ?`, [userId]);
};

module.exports = {
  findByUserId, upsertPendingSecret, markEnabled, recordSuccess, recordFailure,
  insertRecoveryCodes, findUnusedRecoveryCodes, markRecoveryCodeUsed, countUnusedRecoveryCodes, deleteRecoveryCodesByUserId,
};
