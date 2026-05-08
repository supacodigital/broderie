const { pool } = require('../config/db');

// Crée un enregistrement de paiement
const create = async ({ orderId, provider, providerPaymentId, amount, method, status }) => {
  const [result] = await pool.execute(
    `INSERT INTO payments (order_id, provider, provider_payment_id, amount, currency, method, status)
     VALUES (?, ?, ?, ?, 'CHF', ?, ?)`,
    [orderId, provider || 'internal', providerPaymentId || null, amount, method, status || 'pending']
  );
  return result.insertId;
};

// Met à jour le statut d'un paiement par order_id + method
const updateStatusByOrder = async (orderId, method, status, providerPaymentId = null) => {
  await pool.execute(
    `UPDATE payments SET status = ?, provider_payment_id = COALESCE(?, provider_payment_id)
     WHERE order_id = ? AND method = ?`,
    [status, providerPaymentId, orderId, method]
  );
};

// Récupère le paiement d'une commande
const findByOrderId = async (orderId) => {
  const [rows] = await pool.execute(
    `SELECT id, order_id, provider, provider_payment_id, amount, currency, method, status, created_at
     FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1`,
    [orderId]
  );
  return rows[0] || null;
};

module.exports = { create, updateStatusByOrder, findByOrderId };
