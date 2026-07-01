const { pool } = require('../config/db');

// Recherche un utilisateur par email (incluant les supprimés pour la migration)
const findByEmail = async (email) => {
  const [rows] = await pool.execute(
    `SELECT id, email, password_hash, first_name, last_name, role, locale, is_active, email_verified_at, deleted_at
     FROM users
     WHERE email = ?
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
};

// Recherche un utilisateur actif par id
const findById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT id, email, first_name, last_name, role, locale, is_active, email_verified_at, created_at
     FROM users
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
};

// Création d'un nouvel utilisateur — password_hash nullable pour les comptes Google
// emailVerified : true pour les comptes Google (email déjà vérifié par Google)
const create = async ({ email, passwordHash = null, firstName, lastName, locale = 'fr', googleId = null, avatarUrl = null, emailVerified = false }) => {
  const [result] = await pool.execute(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, locale, google_id, avatar_url, is_active, email_verified_at)
     VALUES (?, ?, ?, ?, 'client', ?, ?, ?, 1, ?)`,
    [email, passwordHash, firstName, lastName, locale, googleId, avatarUrl, emailVerified ? new Date() : null]
  );
  return result.insertId;
};

// Vérification si un email est déjà utilisé
const emailExists = async (email) => {
  const [rows] = await pool.execute(
    `SELECT id FROM users WHERE email = ? LIMIT 1`,
    [email]
  );
  return rows.length > 0;
};

// Mise à jour du profil utilisateur
const update = async (id, { firstName, lastName, locale }) => {
  await pool.execute(
    `UPDATE users SET first_name = ?, last_name = ?, locale = ? WHERE id = ?`,
    [firstName, lastName, locale, id]
  );
  return findById(id);
};

// Adresses d'un utilisateur
const findAddresses = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT id, label, address_type, first_name, last_name, street, city, zip, country, canton, is_default
     FROM addresses
     WHERE user_id = ?
     ORDER BY is_default DESC, id ASC`,
    [userId]
  );
  return rows;
};

// Création d'une adresse
const createAddress = async (userId, { label, addressType, firstName, lastName, street, city, zip, country, canton, isDefault }) => {
  // Si nouvelle adresse par défaut, retirer le défaut des autres
  if (isDefault) {
    await pool.execute(
      `UPDATE addresses SET is_default = 0 WHERE user_id = ?`,
      [userId]
    );
  }
  const [result] = await pool.execute(
    `INSERT INTO addresses (user_id, label, address_type, first_name, last_name, street, city, zip, country, canton, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, label, addressType || 'both', firstName || null, lastName || null, street, city, zip, country || 'CH', canton || null, isDefault ? 1 : 0]
  );
  return result.insertId;
};

// Mise à jour d'une adresse
const updateAddress = async (addressId, userId, { label, addressType, firstName, lastName, street, city, zip, country, canton, isDefault }) => {
  if (isDefault) {
    await pool.execute(
      `UPDATE addresses SET is_default = 0 WHERE user_id = ?`,
      [userId]
    );
  }
  await pool.execute(
    `UPDATE addresses SET label = ?, address_type = ?, first_name = ?, last_name = ?, street = ?, city = ?, zip = ?, country = ?, canton = ?, is_default = ?
     WHERE id = ? AND user_id = ?`,
    [label, addressType || 'both', firstName || null, lastName || null, street, city, zip, country || 'CH', canton || null, isDefault ? 1 : 0, addressId, userId]
  );
};

// Suppression d'une adresse — si elle était la défaut, en promote une autre automatiquement
const deleteAddress = async (addressId, userId) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[addr]] = await connection.execute(
      `SELECT is_default FROM addresses WHERE id = ? AND user_id = ?`,
      [addressId, userId]
    );
    if (!addr) { await connection.rollback(); return false; }

    const [result] = await connection.execute(
      `DELETE FROM addresses WHERE id = ? AND user_id = ?`,
      [addressId, userId]
    );

    // Si l'adresse supprimée était la défaut, on promeut la suivante
    if (addr.is_default) {
      await connection.execute(
        `UPDATE addresses SET is_default = 1
         WHERE user_id = ? ORDER BY id ASC LIMIT 1`,
        [userId]
      );
    }

    await connection.commit();
    return result.affectedRows > 0;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

// Recherche un utilisateur actif par google_id
const findByGoogleId = async (googleId) => {
  const [rows] = await pool.execute(
    `SELECT id, email, first_name, last_name, role, locale, avatar_url, is_active, deleted_at
     FROM users
     WHERE google_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [googleId]
  );
  return rows[0] || null;
};

// Lie un google_id à un compte existant et met à jour l'avatar
const linkGoogleAccount = async (userId, googleId, avatarUrl) => {
  await pool.execute(
    `UPDATE users SET google_id = ?, avatar_url = ? WHERE id = ?`,
    [googleId, avatarUrl || null, userId]
  );
};

// Recherche un utilisateur par id avec son hash de mot de passe — usage interne uniquement (changePassword)
const findByIdWithPassword = async (id) => {
  const [rows] = await pool.execute(
    `SELECT id, email, password_hash FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] || null;
};

// Sauvegarde d'un token de réinitialisation de mot de passe (hachage SHA-256, expiration 1h)
const saveResetToken = async (userId, tokenHash, expiresAt) => {
  await pool.execute(
    `UPDATE users SET reset_token_hash = ?, reset_token_expires = ? WHERE id = ?`,
    [tokenHash, expiresAt, userId]
  );
};

// Recherche un utilisateur par token de réinitialisation valide
const findByResetToken = async (tokenHash) => {
  const [rows] = await pool.execute(
    `SELECT id, email, first_name, last_name, locale
     FROM users
     WHERE reset_token_hash = ? AND reset_token_expires > NOW() AND deleted_at IS NULL
     LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
};

// Mise à jour du mot de passe + invalidation du token
const updatePassword = async (userId, passwordHash) => {
  await pool.execute(
    `UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_token_expires = NULL
     WHERE id = ?`,
    [passwordHash, userId]
  );
};

// ── Vérification email (même pattern que le reset password) ──

// Sauvegarde d'un token de vérification email (hachage SHA-256, expiration fournie)
const saveVerifyToken = async (userId, tokenHash, expiresAt) => {
  await pool.execute(
    `UPDATE users SET verify_token_hash = ?, verify_token_expires = ? WHERE id = ?`,
    [tokenHash, expiresAt, userId]
  );
};

// Recherche un utilisateur par token de vérification valide (non expiré, non supprimé)
const findByVerifyToken = async (tokenHash) => {
  const [rows] = await pool.execute(
    `SELECT id, email, first_name, last_name, locale, email_verified_at
     FROM users
     WHERE verify_token_hash = ? AND verify_token_expires > NOW() AND deleted_at IS NULL
     LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
};

// Marque l'email comme vérifié + invalide le token
const markEmailVerified = async (userId) => {
  await pool.execute(
    `UPDATE users SET email_verified_at = NOW(), verify_token_hash = NULL, verify_token_expires = NULL
     WHERE id = ?`,
    [userId]
  );
};

module.exports = {
  findByEmail, findById, findByIdWithPassword, findByGoogleId, linkGoogleAccount,
  create, emailExists, update,
  findAddresses, createAddress, updateAddress, deleteAddress,
  saveResetToken, findByResetToken, updatePassword,
  saveVerifyToken, findByVerifyToken, markEmailVerified,
};
