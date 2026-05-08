const { pool } = require('../config/db');

// Compte fidélité d'un utilisateur avec son palier actuel
const findAccount = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT la.id, la.total_spend_chf, la.current_tier_id, la.updated_at,
            lt.name AS tier_name, lt.min_spend_chf, lt.reward_type, lt.reward_value
     FROM loyalty_accounts la
     LEFT JOIN loyalty_tiers lt ON lt.id = la.current_tier_id
     WHERE la.user_id = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
};

// Crée un compte fidélité si inexistant
const createAccount = async (userId) => {
  await pool.execute(
    `INSERT IGNORE INTO loyalty_accounts (user_id, total_spend_chf) VALUES (?, 0)`,
    [userId]
  );
};

// Bons disponibles d'un utilisateur
const findRewards = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT lr.id, lr.code, lr.type, lr.value, lr.status, lr.expires_at, lr.created_at,
            lt.name AS tier_name
     FROM loyalty_rewards lr
     INNER JOIN loyalty_tiers lt ON lt.id = lr.tier_id
     WHERE lr.user_id = ? AND lr.status = 'available'
     ORDER BY lr.expires_at ASC`,
    [userId]
  );
  return rows;
};

// Historique des transactions fidélité
const findTransactions = async (userId) => {
  const [rows] = await pool.execute(
    `SELECT id, amount_chf, type, created_at FROM loyalty_transactions
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId]
  );
  return rows;
};

// Tous les paliers actifs triés par seuil
const findTiers = async () => {
  const [rows] = await pool.execute(
    `SELECT id, name, min_spend_chf, reward_type, reward_value, reward_validity_days, is_active, sort_order
     FROM loyalty_tiers
     WHERE is_active = 1
     ORDER BY min_spend_chf ASC`
  );
  return rows;
};

// Tous les paliers pour l'admin (actifs + inactifs)
const findAllTiers = async () => {
  const [rows] = await pool.execute(
    `SELECT id, name, min_spend_chf, reward_type, reward_value, reward_validity_days, is_active, sort_order
     FROM loyalty_tiers
     ORDER BY min_spend_chf ASC`
  );
  return rows;
};

const createTier = async ({ name, minSpendChf, rewardType, rewardValue, rewardValidityDays, isActive, sortOrder }) => {
  const [result] = await pool.execute(
    `INSERT INTO loyalty_tiers (name, min_spend_chf, reward_type, reward_value, reward_validity_days, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, minSpendChf, rewardType, rewardValue, rewardValidityDays || 90, isActive !== false ? 1 : 0, sortOrder || 0]
  );
  return result.insertId;
};

const updateTier = async (id, { name, minSpendChf, rewardType, rewardValue, rewardValidityDays, isActive, sortOrder }) => {
  await pool.execute(
    `UPDATE loyalty_tiers SET name = ?, min_spend_chf = ?, reward_type = ?, reward_value = ?,
     reward_validity_days = ?, is_active = ?, sort_order = ? WHERE id = ?`,
    [name, minSpendChf, rewardType, rewardValue, rewardValidityDays, isActive ? 1 : 0, sortOrder || 0, id]
  );
};

const deleteTier = async (id) => {
  const [result] = await pool.execute(`DELETE FROM loyalty_tiers WHERE id = ?`, [id]);
  return result.affectedRows > 0;
};

// Enregistre une transaction et met à jour le total_spend_chf
const addTransaction = async (userId, orderId, amountChf, type) => {
  await pool.execute(
    `INSERT INTO loyalty_transactions (user_id, order_id, amount_chf, type) VALUES (?, ?, ?, ?)`,
    [userId, orderId, amountChf, type]
  );
  const delta = type === 'earn' ? amountChf : type === 'refund' ? -amountChf : 0;
  if (delta !== 0) {
    await pool.execute(
      `UPDATE loyalty_accounts SET total_spend_chf = GREATEST(0, total_spend_chf + ?) WHERE user_id = ?`,
      [delta, userId]
    );
  }
};

// Génère un bon de réduction unique pour un palier atteint
const createReward = async (userId, tierId, { type, value, validityDays }) => {
  const code = `FIDELITE-${Date.now()}-${userId}`.toUpperCase();
  const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);
  await pool.execute(
    `INSERT INTO loyalty_rewards (user_id, tier_id, code, type, value, status, expires_at)
     VALUES (?, ?, ?, ?, ?, 'available', ?)`,
    [userId, tierId, code, type, value, expiresAt]
  );
  return code;
};

// Met à jour le palier actuel du compte fidélité
const updateAccountTier = async (userId, tierId) => {
  await pool.execute(
    `UPDATE loyalty_accounts SET current_tier_id = ? WHERE user_id = ?`,
    [tierId, userId]
  );
};

// Vérifie si un palier a déjà été récompensé pour cet utilisateur
const tierAlreadyRewarded = async (userId, tierId) => {
  const [rows] = await pool.execute(
    `SELECT id FROM loyalty_rewards WHERE user_id = ? AND tier_id = ? LIMIT 1`,
    [userId, tierId]
  );
  return rows.length > 0;
};

// Vue globale des comptes fidélité pour l'admin avec bons disponibles
const findAllAccounts = async ({ page = 1, limit = 20, search = '' }) => {
  const offset = (page - 1) * limit;
  const params = [];
  let where = '';

  if (search) {
    where = 'WHERE u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?';
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM loyalty_accounts la
     INNER JOIN users u ON u.id = la.user_id
     ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT la.user_id, la.total_spend_chf, la.updated_at,
            u.email, u.first_name, u.last_name,
            lt.name AS tier_name,
            COUNT(lr.id) AS available_rewards
     FROM loyalty_accounts la
     INNER JOIN users u ON u.id = la.user_id
     LEFT JOIN loyalty_tiers lt ON lt.id = la.current_tier_id
     LEFT JOIN loyalty_rewards lr ON lr.user_id = la.user_id AND lr.status = 'available'
     ${where}
     GROUP BY la.user_id
     ORDER BY la.total_spend_chf DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return { rows, total };
};

// KPIs globaux pour le tableau de bord fidélité
const getGlobalKpis = async () => {
  const [[accounts]] = await pool.execute(
    `SELECT COUNT(*) AS total_accounts FROM loyalty_accounts`
  );
  const [[rewards]] = await pool.execute(
    `SELECT
       COUNT(*) AS total_rewards,
       SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available_rewards,
       SUM(CASE WHEN status = 'used'      THEN 1 ELSE 0 END) AS used_rewards,
       SUM(CASE WHEN status = 'expired'   THEN 1 ELSE 0 END) AS expired_rewards
     FROM loyalty_rewards`
  );
  return {
    totalAccounts:    accounts.total_accounts,
    availableRewards: rewards.available_rewards,
    usedRewards:      rewards.used_rewards,
    expiredRewards:   rewards.expired_rewards,
  };
};

// Liste des bons de réduction pour l'admin avec filtres
const findAllRewards = async ({ page = 1, limit = 20, status = '' }) => {
  const offset = (page - 1) * limit;
  const params = [];
  let where = '';

  if (status) {
    where = 'WHERE lr.status = ?';
    params.push(status);
  }

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM loyalty_rewards lr ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await pool.query(
    `SELECT lr.id, lr.code, lr.type, lr.value, lr.status, lr.expires_at, lr.created_at,
            u.first_name, u.last_name, u.email,
            lt.name AS tier_name
     FROM loyalty_rewards lr
     INNER JOIN users u ON u.id = lr.user_id
     INNER JOIN loyalty_tiers lt ON lt.id = lr.tier_id
     ${where}
     ORDER BY lr.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return { rows, total };
};

module.exports = {
  findAccount, createAccount, findRewards, findTransactions,
  findTiers, findAllTiers, createTier, updateTier, deleteTier,
  addTransaction, createReward, updateAccountTier, tierAlreadyRewarded,
  findAllAccounts, getGlobalKpis, findAllRewards,
};
