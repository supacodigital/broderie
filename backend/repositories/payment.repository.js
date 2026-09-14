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
// Met à jour le paiement le PLUS RÉCENT d'une commande pour une méthode donnée.
// Le ORDER BY + LIMIT 1 est indispensable : lockOrderForPaymentIntent insère une
// nouvelle ligne `payments` à chaque tentative, donc plusieurs lignes coexistent
// pour une même méthode. Sans ce ciblage, un UPDATE 'failed' écraserait aussi une
// ligne 'succeeded' d'une tentative antérieure.
const updateStatusByOrder = async (orderId, method, status, providerPaymentId = null) => {
  await pool.execute(
    `UPDATE payments SET status = ?, provider_payment_id = COALESCE(?, provider_payment_id)
     WHERE order_id = ? AND method = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
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

// Récupère le paiement d'une commande pour une méthode précise (ex: annuler l'ancien
// PaymentIntent Twint en attente avant d'en générer un nouveau QR)
const findByOrderIdAndMethod = async (orderId, method) => {
  const [rows] = await pool.execute(
    `SELECT id, order_id, provider, provider_payment_id, amount, currency, method, status, created_at
     FROM payments WHERE order_id = ? AND method = ? ORDER BY created_at DESC LIMIT 1`,
    [orderId, method]
  );
  return rows[0] || null;
};

// Enregistre un event webhook Stripe pour l'idempotence.
// Appelé APRÈS le traitement métier (voir payment.service.js) : acquitter en amont
// ferait perdre le paiement si le traitement échoue et que Stripe retente.
// Retourne true si c'est un event nouveau, false s'il avait déjà été enregistré.
const registerWebhookEvent = async (eventId, type) => {
  const [result] = await pool.execute(
    `INSERT IGNORE INTO stripe_webhook_events (event_id, type) VALUES (?, ?)`,
    [eventId, type]
  );
  return result.affectedRows > 0;
};

// Vérifie si un event a déjà été traité avec succès, sans rien écrire.
const hasProcessedWebhookEvent = async (eventId) => {
  const [rows] = await pool.execute(
    `SELECT event_id FROM stripe_webhook_events WHERE event_id = ? LIMIT 1`,
    [eventId]
  );
  return rows.length > 0;
};

module.exports = {
  create, updateStatusByOrder, findByOrderId, findByOrderIdAndMethod,
  registerWebhookEvent, hasProcessedWebhookEvent,
};
