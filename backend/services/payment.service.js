const stripe            = require('../config/stripe');
const paymentRepository = require('../repositories/payment.repository');
const orderRepository   = require('../repositories/order.repository');
const userRepository    = require('../repositories/user.repository');
const emailService      = require('./email.service');
const loyaltyService    = require('./loyalty.service');
const { pool }          = require('../config/db');
const { AppError }      = require('../middlewares/errorHandler');
const { roundCHF }      = require('../utils/chf.utils');
const env               = require('../config/env');

// ─────────────────────────────────────────────────────────────
// Carte — crée un PaymentIntent Stripe et retourne le client_secret
// ─────────────────────────────────────────────────────────────
const createCardIntent = async (orderId) => {
  if (!stripe) throw new AppError('Paiements Stripe non configurés.', 503);

  const order = await orderRepository.findById(orderId);
  if (!order) throw new AppError('Commande introuvable.', 404);

  if (!['pending', 'awaiting_payment'].includes(order.status)) {
    throw new AppError('Cette commande ne peut pas être payée.', 400);
  }

  const amountCents = Math.round(roundCHF(parseFloat(order.total)) * 100);

  const intent = await stripe.paymentIntents.create({
    amount:               amountCents,
    currency:             'chf',
    payment_method_types: ['card'],
    metadata: { order_id: String(orderId) },
  });

  const existing = await paymentRepository.findByOrderId(orderId);
  if (existing) {
    await paymentRepository.updateStatusByOrder(orderId, 'card', 'pending', intent.id);
  } else {
    await paymentRepository.create({
      orderId,
      provider:          'stripe',
      providerPaymentId: intent.id,
      amount:            order.total,
      method:            'card',
      status:            'pending',
    });
  }

  return { clientSecret: intent.client_secret, amount: order.total };
};

// ─────────────────────────────────────────────────────────────
// Twint QR — crée un PaymentIntent Stripe et retourne le QR
// ─────────────────────────────────────────────────────────────
const createTwintIntent = async (orderId) => {
  if (!stripe) throw new AppError('Paiements Stripe non configurés.', 503);

  const order = await orderRepository.findById(orderId);
  if (!order) throw new AppError('Commande introuvable.', 404);

  if (!['pending', 'awaiting_payment'].includes(order.status)) {
    throw new AppError('Cette commande ne peut pas être payée.', 400);
  }

  // Annuler un éventuel PaymentIntent précédent pour cette commande
  const existing = await paymentRepository.findByOrderId(orderId);
  if (existing?.provider_payment_id && existing.status === 'pending') {
    try {
      await stripe.paymentIntents.cancel(existing.provider_payment_id);
    } catch {
      // Peut échouer si déjà annulé — on continue
    }
  }

  // Montant en centimes (CHF) — Stripe travaille en centimes
  const amountCents = Math.round(roundCHF(parseFloat(order.total)) * 100);

  // Twint requiert confirm:true + return_url pour que next_action soit renseigné
  const returnUrl = `${env.clientUrl || 'http://localhost:5173'}/commande/${orderId}/confirmation`;

  // Stripe impose la création d'un PaymentMethod avant de confirmer
  const paymentMethod = await stripe.paymentMethods.create({ type: 'twint' });

  const intent = await stripe.paymentIntents.create({
    amount:               amountCents,
    currency:             'chf',
    payment_method_types: ['twint'],
    payment_method:       paymentMethod.id,
    confirm:              true,
    return_url:           returnUrl,
    metadata: {
      order_id: String(orderId),
    },
  });

  // Sauvegarde ou mise à jour du paiement en DB
  if (existing) {
    await paymentRepository.updateStatusByOrder(orderId, 'twint', 'pending', intent.id);
  } else {
    await paymentRepository.create({
      orderId,
      provider:          'stripe',
      providerPaymentId: intent.id,
      amount:            order.total,
      method:            'twint',
      status:            'pending',
    });
  }

  // Production : QR PNG Twint — Test Stripe : redirect_to_url (pas de QR réel)
  const qrUrl       = intent.next_action?.twint_display_qr_code?.image_url_png ?? null;
  const redirectUrl = intent.next_action?.redirect_to_url?.url ?? null;

  return {
    paymentIntentId: intent.id,
    clientSecret:    intent.client_secret,
    qrUrl,
    redirectUrl,
    isTestMode:      !qrUrl && !!redirectUrl,
    amount:          order.total,
    expiresAt:       new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
};

// ─────────────────────────────────────────────────────────────
// Envoi QR Twint par email (depuis l'admin)
// ─────────────────────────────────────────────────────────────
const sendTwintQrByEmail = async (orderId, adminUserId) => {
  if (!stripe) throw new AppError('Paiements Stripe non configurés.', 503);

  const twint = await createTwintIntent(orderId);

  const order = await orderRepository.findById(orderId);
  const user  = await userRepository.findById(order.user_id);
  if (!user) throw new AppError('Client introuvable.', 404);

  // Mode test Stripe : pas de QR PNG — on envoie l'URL de paiement à la place
  if (twint.isTestMode) {
    await emailService.sendTwintQr({
      user,
      order,
      qrBuffer:    null,
      redirectUrl: twint.redirectUrl,
      expiresAt:   twint.expiresAt,
      isTestMode:  true,
    });
    return { paymentIntentId: twint.paymentIntentId, expiresAt: twint.expiresAt, isTestMode: true };
  }

  if (!twint.qrUrl) throw new AppError('Impossible de générer le QR Twint.', 500);

  // Production : téléchargement du PNG Twint depuis Stripe
  const response = await fetch(twint.qrUrl);
  if (!response.ok) throw new AppError('Impossible de récupérer l\'image QR.', 500);
  const arrayBuffer = await response.arrayBuffer();
  const qrBuffer    = Buffer.from(arrayBuffer);

  await emailService.sendTwintQr({ user, order, qrBuffer, expiresAt: twint.expiresAt, isTestMode: false });

  return { paymentIntentId: twint.paymentIntentId, expiresAt: twint.expiresAt };
};

// ─────────────────────────────────────────────────────────────
// Webhook Stripe — validation du paiement
// ─────────────────────────────────────────────────────────────
const handleWebhook = async (rawBody, signature) => {
  if (!stripe) throw new AppError('Paiements Stripe non configurés.', 503);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      env.stripeWebhookSecret
    );
  } catch (err) {
    throw new AppError(`Signature webhook invalide : ${err.message}`, 400);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent  = event.data.object;
    const orderId = parseInt(intent.metadata?.order_id);
    if (!orderId) return;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(
        `UPDATE orders SET status = 'paid' WHERE id = ? AND status != 'paid'`,
        [orderId]
      );
      await connection.execute(
        `INSERT INTO order_status_history (order_id, status, note, created_by)
         VALUES (?, 'paid', 'Paiement Stripe confirmé', NULL)`,
        [orderId]
      );

      // Mise à jour du paiement — dans la même transaction pour cohérence
      const method = intent.payment_method_types?.includes('card') ? 'card' : 'twint';
      await connection.execute(
        `UPDATE payments SET status = 'succeeded', provider_payment_id = ?
         WHERE order_id = ? AND method = ?`,
        [intent.id, orderId, method]
      );

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    // Email + fidélité — non bloquants
    const order = await orderRepository.findById(orderId);
    if (order) {
      userRepository.findById(order.user_id).then(async (user) => {
        if (!user) return;

        emailService.sendOrderStatusUpdate({ user, order, newStatus: 'paid' }).catch((err) => {
          console.error('[Email] Statut payé non envoyé :', err.message);
        });

        loyaltyService.processOrderEarning(order.user_id, orderId, order.total).catch((err) => {
          console.error('[Fidélité] Crédit points échoué :', err.message);
        });
      }).catch(() => {});
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent  = event.data.object;
    const orderId = parseInt(intent.metadata?.order_id);
    if (orderId) {
      const method = intent.payment_method_types?.includes('card') ? 'card' : 'twint';
      await paymentRepository.updateStatusByOrder(orderId, method, 'failed');
    }
  }
};

module.exports = { createCardIntent, createTwintIntent, sendTwintQrByEmail, handleWebhook };
