const stripe            = require('../config/stripe');
const QRCode            = require('qrcode');
const paymentRepository = require('../repositories/payment.repository');
const orderRepository   = require('../repositories/order.repository');
const loyaltyService    = require('./loyalty.service');
const { AppError }      = require('../middlewares/errorHandler');
const { roundCHF }      = require('../utils/chf.utils');
const env               = require('../config/env');

/* Traduit une erreur Stripe en message exploitable par la cliente.

   Une clé absente, expirée ou révoquée, ou un moyen de paiement non activé sur
   le compte Stripe, sont des problèmes de configuration de la boutique — pas des
   fautes de la cliente. Sans ce garde-fou, elle se retrouve devant un « une
   erreur est survenue » générique au moment de payer, et abandonne sa commande
   sans que personne ne sache pourquoi.

   Le détail technique reste dans les logs du serveur ; la cliente reçoit une
   consigne utile : choisir un autre moyen de paiement. */
const asPaymentError = (err) => {
  const type = err?.type ?? '';
  const code = err?.code ?? '';

  if (type === 'StripeAuthenticationError' || code === 'api_key_expired') {
    console.error('[Stripe] clé API refusée — paiements par carte et Twint indisponibles:', err.message);
    return new AppError(
      'Le paiement en ligne est momentanément indisponible. Choisissez « Facture » ou « Retrait en boutique », ou réessayez plus tard.',
      503
    );
  }

  if (code === 'payment_method_not_available' || /not activated|not available/i.test(err?.message ?? '')) {
    console.error('[Stripe] moyen de paiement non activé sur le compte:', err.message);
    return new AppError(
      "Ce moyen de paiement n'est pas disponible pour le moment. Choisissez « Facture » ou « Retrait en boutique ».",
      503
    );
  }

  return err;
};


// ─────────────────────────────────────────────────────────────
// Carte — crée un PaymentIntent Stripe et retourne le client_secret
// `userId` : scope la commande à son propriétaire (un client ne peut pas
// initier le paiement de la commande d'un autre — 404 sinon).
// ─────────────────────────────────────────────────────────────
const createCardIntent = async (orderId, userId) => {
  if (!stripe) throw new AppError('Paiements Stripe non configurés.', 503);

  // Verrouille la commande et réserve la ligne payments avant l'appel Stripe —
  // ferme la fenêtre de course entre deux requêtes concurrentes (double-clic,
  // deux onglets) qui créeraient chacune un PaymentIntent distinct pour la même
  // commande. Lève 404/400/409 selon le cas (voir order.repository.js).
  const { order } = await orderRepository.lockOrderForPaymentIntent(orderId, userId, 'card');

  const amountCents = Math.round(roundCHF(parseFloat(order.total)) * 100);

  let intent;
  try {
    intent = await stripe.paymentIntents.create({
      amount:               amountCents,
      currency:             'chf',
      payment_method_types: ['card'],
      metadata: { order_id: String(orderId) },
    });
  } catch (err) {
    // L'appel Stripe a échoué — libère la réservation pour ne pas bloquer un retry
    // légitime pendant toute la fenêtre de 30s.
    await paymentRepository.updateStatusByOrder(orderId, 'card', 'failed');
    throw asPaymentError(err);
  }

  await paymentRepository.updateStatusByOrder(orderId, 'card', 'pending', intent.id);

  return { clientSecret: intent.client_secret, amount: order.total };
};

// ─────────────────────────────────────────────────────────────
// Twint (sans QR) — crée un PaymentIntent Stripe et retourne le client_secret
// Le front confirme via Stripe.js : redirection vers l'app Twint, pas de QR affiché
// `userId` : scope la commande à son propriétaire (404 si ce n'est pas la sienne).
// ─────────────────────────────────────────────────────────────
const createTwintIntent = async (orderId, userId) => {
  if (!stripe) throw new AppError('Paiements Stripe non configurés.', 503);

  // Voir le commentaire de createCardIntent — même protection contre la double
  // création concurrente de PaymentIntent.
  const { order } = await orderRepository.lockOrderForPaymentIntent(orderId, userId, 'twint');

  const amountCents = Math.round(roundCHF(parseFloat(order.total)) * 100);

  let intent;
  try {
    intent = await stripe.paymentIntents.create({
      amount:               amountCents,
      currency:             'chf',
      payment_method_types: ['twint'],
      metadata: { order_id: String(orderId) },
    });
  } catch (err) {
    await paymentRepository.updateStatusByOrder(orderId, 'twint', 'failed');
    throw asPaymentError(err);
  }

  await paymentRepository.updateStatusByOrder(orderId, 'twint', 'pending', intent.id);

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
  //
  // ⚠️ L'enregistrement se fait APRÈS le traitement métier, jamais avant : marquer
  // l'event comme traité en amont ferait qu'un échec (deadlock MySQL, pool saturé)
  // serait « avalé » au retry de Stripe — la commande resterait impayée alors que
  // le client a été débité. Le doublon est ici préféré à la perte, et il est de toute
  // façon neutralisé en aval (markPaidFromWebhook est idempotent : WHERE status != 'paid',
  // et le crédit fidélité ne part que si statusChanged est vrai).
  const alreadyProcessed = await paymentRepository.hasProcessedWebhookEvent(event.id);
  if (alreadyProcessed) {
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

  // Traitement terminé sans exception : l'event peut être marqué comme acquitté.
  // Si une erreur est survenue plus haut, on n'arrive jamais ici — Stripe retentera
  // et le traitement sera rejoué (opérations idempotentes en aval).
  await paymentRepository.registerWebhookEvent(event.id, event.type);
};

module.exports = { createCardIntent, createTwintIntent, createTwintQrForEmail, handleWebhook };
