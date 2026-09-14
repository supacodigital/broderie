const stripe            = require('../config/stripe');
const QRCode            = require('qrcode');
const paymentRepository = require('../repositories/payment.repository');
const orderRepository   = require('../repositories/order.repository');
const loyaltyService    = require('./loyalty.service');
const { AppError }      = require('../middlewares/errorHandler');
const { roundCHF }      = require('../utils/chf.utils');
const env               = require('../config/env');

// ─────────────────────────────────────────────────────────────
// Carte — crée un PaymentIntent Stripe et retourne le client_secret
// `userId` : scope la commande à son propriétaire (un client ne peut pas
// initier le paiement de la commande d'un autre — 404 sinon).
// ─────────────────────────────────────────────────────────────
const createCardIntent = async (orderId, userId) => {
  if (!stripe) throw new AppError('Paiements Stripe non configurés.', 503);

  const order = await orderRepository.findById(orderId, userId);
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
// Twint (sans QR) — crée un PaymentIntent Stripe et retourne le client_secret
// Le front confirme via Stripe.js : redirection vers l'app Twint, pas de QR affiché
// `userId` : scope la commande à son propriétaire (404 si ce n'est pas la sienne).
// ─────────────────────────────────────────────────────────────
const createTwintIntent = async (orderId, userId) => {
  if (!stripe) throw new AppError('Paiements Stripe non configurés.', 503);

  const order = await orderRepository.findById(orderId, userId);
  if (!order) throw new AppError('Commande introuvable.', 404);

  if (!['pending', 'awaiting_payment'].includes(order.status)) {
    throw new AppError('Cette commande ne peut pas être payée.', 400);
  }

  const amountCents = Math.round(roundCHF(parseFloat(order.total)) * 100);

  const intent = await stripe.paymentIntents.create({
    amount:               amountCents,
    currency:             'chf',
    payment_method_types: ['twint'],
    metadata: { order_id: String(orderId) },
  });

  const existing = await paymentRepository.findByOrderId(orderId);
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

  return { clientSecret: intent.client_secret, amount: order.total };
};

// Durée de validité du QR Twint envoyé par email — Stripe garde le PaymentIntent
// "requires_action" bien plus longtemps, mais on affiche une échéance courte et
// prudente au client pour l'inciter à payer rapidement (voir CLAUDE.md §5).
const TWINT_QR_VALIDITY_HOURS = 24;

// ─────────────────────────────────────────────────────────────
// Twint QR (admin) — crée un PaymentIntent Twint confirmé côté serveur, génère
// un QR code (image PNG) à partir de l'URL de redirection Stripe, et retourne
// tout ce qu'il faut pour l'envoyer par email. Un seul QR actif par commande :
// annule le précédent PaymentIntent Twint en attente avant d'en créer un nouveau.
// ─────────────────────────────────────────────────────────────
const createTwintQrForEmail = async (orderId) => {
  if (!stripe) throw new AppError('Paiements Stripe non configurés.', 503);

  const order = await orderRepository.findById(orderId);
  if (!order) throw new AppError('Commande introuvable.', 404);

  if (!['pending', 'awaiting_payment', 'pending_invoice'].includes(order.status)) {
    throw new AppError('Cette commande ne peut pas être payée.', 400);
  }

  // Annule le précédent QR Twint en attente pour cette commande, s'il existe —
  // évite d'avoir deux PaymentIntents Twint valides en parallèle sur la même commande.
  const previous = await paymentRepository.findByOrderIdAndMethod(orderId, 'twint');
  if (previous && previous.status === 'pending' && previous.provider_payment_id) {
    try {
      await stripe.paymentIntents.cancel(previous.provider_payment_id);
    } catch (err) {
      // Déjà annulé/expiré/payé côté Stripe — pas bloquant, on continue avec un nouveau QR
      console.warn('[Twint] Annulation ancien PaymentIntent échouée (non bloquant) :', err.message);
    }
  }

  const amountCents = Math.round(roundCHF(parseFloat(order.total)) * 100);

  // confirm: true + payment_method_data côté serveur (sans Stripe.js client) : Stripe
  // renvoie un PaymentIntent "requires_action" dont next_action est une redirection
  // (Stripe ne fournit pas de QR nativement pour Twint) — on génère le QR nous-mêmes
  // à partir de cette URL, que le client scanne avec l'app Twint.
  const intent = await stripe.paymentIntents.create({
    amount:               amountCents,
    currency:             'chf',
    payment_method_types: ['twint'],
    confirm:              true,
    payment_method_data:  { type: 'twint' },
    return_url:            `${env.clientUrl}/commande?order=${orderId}`,
    metadata: { order_id: String(orderId) },
  });

  const redirectUrl = intent.next_action?.redirect_to_url?.url;
  if (!redirectUrl) {
    throw new AppError('Impossible de générer le QR Twint pour cette commande.', 502);
  }

  const qrBuffer = await QRCode.toBuffer(redirectUrl, { width: 400, margin: 2 });

  const existing = await paymentRepository.findByOrderId(orderId);
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

  const expiresAt = new Date(Date.now() + TWINT_QR_VALIDITY_HOURS * 60 * 60 * 1000);

  return { qrBuffer, amount: order.total, expiresAt };
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

  // Idempotence : Stripe retente les webhooks non acquittés — si l'event a déjà
  // été traité, on sort (200) sans rien refaire.
  const isNew = await paymentRepository.registerWebhookEvent(event.id, event.type);
  if (!isNew) {
    console.warn('[Stripe] Webhook déjà traité, ignoré :', event.id);
    return;
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent  = event.data.object;
    const orderId = parseInt(intent.metadata?.order_id);
    if (!orderId) return;

    const method = intent.payment_method_types?.includes('card') ? 'card' : 'twint';

    // Transaction : passage à "paid" + historique + mise à jour du paiement
    const { statusChanged } = await orderRepository.markPaidFromWebhook(orderId, intent.id, method);

    // Crédit des points de fidélité — hors transaction (processOrderEarning gère
    // ses propres transactions internes), et SEULEMENT si la commande vient de
    // passer à "paid". Combiné à l'idempotence sur event_id, garantit un crédit unique.
    if (statusChanged) {
      const order = await orderRepository.findById(orderId);
      if (order) {
        await loyaltyService.processOrderEarning(order.user_id, orderId, order.total)
          .catch((err) => console.error('[Fidélité] Crédit points échoué :', err.message));
      }
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

module.exports = { createCardIntent, createTwintIntent, createTwintQrForEmail, handleWebhook };
