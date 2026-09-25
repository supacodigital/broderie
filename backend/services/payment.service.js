const crypto            = require('crypto');
const stripe            = require('../config/stripe');
const QRCode            = require('qrcode');
const paymentRepository = require('../repositories/payment.repository');
const orderRepository   = require('../repositories/order.repository');
const cartRepository    = require('../repositories/cart.repository');
const loyaltyService    = require('./loyalty.service');
const orderService      = require('./order.service');
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


/* Paiement abouti, ou en cours de validation chez Stripe (Twint peut rester
   quelques secondes en « processing ») : la commande est réglée, il ne faut
   surtout pas proposer de payer une seconde fois. */
const SETTLED_INTENT_STATUSES = ['succeeded', 'processing'];

/* Réutilise le paiement déjà créé pour cette commande, s'il est encore utilisable.

   Recharger la page de paiement, revenir en arrière ou rouvrir l'onglet ne doit
   pas créer un second paiement pour la même commande : on rend le premier. Stripe
   est interrogé pour connaître son état réel — un paiement annulé ou échoué ne
   peut pas resservir.

   Un paiement déjà RÉGLÉ bloque toute nouvelle demande (CLI-15). Au retour de
   l'app Twint, la page de paiement se rechargeait, voyait ce paiement réglé comme
   « non réutilisable » et en créait un second, encore ouvert : la cliente se voyait
   proposer de payer deux fois, ou, si la commande était déjà passée à « payée »,
   recevait « Impossible de générer le paiement Twint ». */
const reuseExistingIntent = async (orderId, method) => {
  const intentId = await paymentRepository.findLatestIntentId(orderId, method);
  if (!intentId) return null;

  let intent;
  try {
    intent = await stripe.paymentIntents.retrieve(intentId);
  } catch (err) {
    // Paiement introuvable chez Stripe (clé changée, environnement différent) :
    // on repart sur un nouveau plutôt que de bloquer la cliente.
    console.warn('[Stripe] PaymentIntent existant illisible, un nouveau sera créé :', err.message);
    return null;
  }

  if (SETTLED_INTENT_STATUSES.includes(intent.status)) {
    throw new AppError('Cette commande est déjà réglée.', 409);
  }
  const reusable = ['requires_payment_method', 'requires_confirmation', 'requires_action'];
  return reusable.includes(intent.status) ? intent : null;
};

// ─────────────────────────────────────────────────────────────
// Carte — crée un PaymentIntent Stripe et retourne le client_secret
// `userId` : scope la commande à son propriétaire (un client ne peut pas
// initier le paiement de la commande d'un autre — 404 sinon).
// ─────────────────────────────────────────────────────────────
const createCardIntent = async (orderId, userId) => {
  if (!stripe) throw new AppError('Paiements Stripe non configurés.', 503);

  /* Paiement déjà ouvert pour cette commande — on le rend plutôt que d'en créer
     un second.

     La commande est lue AVEC son propriétaire : ce raccourci court-circuite
     lockOrderForPaymentIntent, qui portait jusqu'ici la seule vérification
     d'appartenance. Sans ce filtre, une cliente connectée pouvait obtenir le
     secret de paiement et le montant de la commande d'une autre en essayant des
     numéros. Une commande qui n'est pas la sienne est introuvable, comme
     ailleurs dans l'application. */
  const ownOrder = await orderRepository.findById(orderId, userId);
  if (!ownOrder) throw new AppError('Commande introuvable.', 404);

  const reusable = await reuseExistingIntent(orderId, 'card');
  if (reusable) {
    return { clientSecret: reusable.client_secret, amount: ownOrder.total };
  }

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

  /* Paiement déjà ouvert pour cette commande — on le rend plutôt que d'en créer
     un second.

     La commande est lue AVEC son propriétaire : ce raccourci court-circuite
     lockOrderForPaymentIntent, qui portait jusqu'ici la seule vérification
     d'appartenance. Sans ce filtre, une cliente connectée pouvait obtenir le
     secret de paiement et le montant de la commande d'une autre en essayant des
     numéros. Une commande qui n'est pas la sienne est introuvable, comme
     ailleurs dans l'application. */
  const ownOrder = await orderRepository.findById(orderId, userId);
  if (!ownOrder) throw new AppError('Commande introuvable.', 404);

  const reusable = await reuseExistingIntent(orderId, 'twint');
  if (reusable) {
    return { clientSecret: reusable.client_secret, amount: ownOrder.total };
  }

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

  if (!['pending', 'awaiting_payment', 'payment_failed', 'pending_invoice'].includes(order.status)) {
    throw new AppError('Cette commande ne peut pas être payée.', 400);
  }

  // Annule le précédent QR Twint en attente pour cette commande, s'il existe —
  // évite d'avoir deux PaymentIntents Twint valides en parallèle sur la même commande.
  const previous = await paymentRepository.findByOrderIdAndMethod(orderId, 'twint');
  if (previous && previous.status === 'pending' && previous.provider_payment_id) {
    try {
      await stripe.paymentIntents.cancel(previous.provider_payment_id);
      await paymentRepository.updateStatusByIntentId(previous.provider_payment_id, 'cancelled');
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
  /* Retour sur une page publique : la cliente paie le plus souvent depuis son
     téléphone, où elle n'est pas connectée au site. Le retour vers la caisse
     (réservée aux comptes connectés) lui présentait la page de connexion au
     lieu de la confirmation de son paiement. */
  const intent = await stripe.paymentIntents.create({
    amount:               amountCents,
    currency:             'chf',
    payment_method_types: ['twint'],
    confirm:              true,
    payment_method_data:  { type: 'twint' },
    return_url:            `${env.clientUrl}/paiement-twint`,
    metadata: { order_id: String(orderId) },
  });

  const redirectUrl = intent.next_action?.redirect_to_url?.url;
  if (!redirectUrl) {
    throw new AppError('Impossible de générer le QR Twint pour cette commande.', 502);
  }

  const qrBuffer = await QRCode.toBuffer(redirectUrl, { width: 400, margin: 2 });

  /* Une ligne par QR envoyé, marquée `stripe_qr_email` : ce QR reste payable
     24 h, et l'annulation automatique des commandes impayées (2 h) doit
     l'épargner pendant ce délai — voir findExpiredUnpaidOnlineOrderIds.
     La mise à jour d'une ligne existante ne ciblait que les lignes Twint : sur
     une commande par carte, le QR n'était rattaché à aucun paiement. */
  await paymentRepository.create({
    orderId,
    provider:          'stripe_qr_email',
    providerPaymentId: intent.id,
    amount:            order.total,
    method:            'twint',
    status:            'pending',
  });

  const expiresAt = new Date(Date.now() + TWINT_QR_VALIDITY_HOURS * 60 * 60 * 1000);

  // payUrl : même paiement que le QR, en lien à toucher depuis le téléphone
  return { qrBuffer, payUrl: redirectUrl, amount: order.total, expiresAt };
};

/* Retour de la cliente après avoir payé un QR Twint reçu par e-mail.

   Page publique : elle arrive du téléphone qui a scanné le QR, sans session sur
   le site. Le secret du paiement, ajouté par Stripe à l'adresse de retour,
   prouve qu'elle vient bien de ce paiement — c'est l'usage prévu par Stripe
   pour lire l'état d'un paiement côté client. Seul le numéro de commande est
   renvoyé : ni nom, ni adresse, ni articles.

   Comme au retour de la caisse (syncOrderPayment), un paiement abouti valide
   la commande sans attendre le webhook. */
const QR_RETURN_STATUSES = {
  succeeded:       'paid',
  processing:      'processing',
  requires_action: 'processing',
};

const secretsMatch = (expected, received) => {
  const a = Buffer.from(String(expected ?? ''));
  const b = Buffer.from(String(received ?? ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const confirmQrPaymentReturn = async (intentId, clientSecret) => {
  if (!stripe) throw new AppError('Paiements Stripe non configurés.', 503);

  const notFound = new AppError('Paiement introuvable.', 404);
  const payment = await paymentRepository.findByIntentId(intentId);
  if (!payment || payment.provider !== 'stripe_qr_email') throw notFound;

  let intent;
  try {
    intent = await stripe.paymentIntents.retrieve(intentId);
  } catch (err) {
    console.error(`[Stripe] Vérification du QR Twint impossible (commande ${payment.order_id}) :`, err.message);
    throw new AppError('Impossible de vérifier le paiement pour le moment. Réessayez dans un instant.', 503);
  }
  if (!secretsMatch(intent.client_secret, clientSecret)) throw notFound;

  if (intent.status === 'succeeded') await applySucceededIntent(intent);

  // N° de commande affiché à la cliente = n° de facture (attribué au paiement)
  const order = await orderRepository.findById(payment.order_id);
  return {
    orderId:       payment.order_id,
    invoiceNumber: order?.invoice_number ?? null,
    // paid | processing | failed (refusé, abandonné, ou QR remplacé par un plus récent)
    paymentStatus: QR_RETURN_STATUSES[intent.status] ?? 'failed',
  };
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
    await applySucceededIntent(event.data.object);
  }

  if (event.type === 'payment_intent.payment_failed') {
    await applyFailedIntent(event.data.object);
  }

  // Traitement terminé sans exception : l'event peut être marqué comme acquitté.
  // Si une erreur est survenue plus haut, on n'arrive jamais ici — Stripe retentera
  // et le traitement sera rejoué (opérations idempotentes en aval).
  await paymentRepository.registerWebhookEvent(event.id, event.type);
};


/* Valide la commande d'un paiement Stripe abouti.

   Appelé par le webhook, et au retour de la cliente sur le site (syncOrderPayment) :
   la confirmation qu'elle voit ne dépend ainsi plus du délai d'arrivée du webhook.
   Idempotent — markPaidFromWebhook ne fait passer la commande à « payée » qu'une
   fois, et la fidélité comme les e-mails ne partent que sur ce passage. */
const applySucceededIntent = async (intent) => {
  const orderId = parseInt(intent.metadata?.order_id);
  if (!orderId) return;

  const method = intent.payment_method_types?.includes('card') ? 'card' : 'twint';

  /* Le montant encaissé doit couvrir la commande.

     Rien ne le vérifiait : une commande passait à « payée » sur la seule
     présence de son numéro dans les métadonnées du paiement. Un paiement créé
     pour un autre montant — commande modifiée entre-temps, ou métadonnées
     forgées via un compte Stripe tiers — aurait soldé la commande pour une
     somme inférieure.

     Comparaison en centimes, l'unité de Stripe : comparer des francs en
     virgule flottante ferait échouer des paiements justes (0.1 + 0.2 ≠ 0.3).
     Un encaissement SUPÉRIEUR est accepté — refuser une commande trop payée
     pénaliserait la cliente ; l'écart se règle par un remboursement. */
  const order = await orderRepository.findById(orderId);
  if (!order) {
    console.error('[Stripe] Paiement pour une commande inconnue :', orderId);
    return;
  }

  const expectedCents = Math.round(roundCHF(parseFloat(order.total)) * 100);
  const paidCents     = intent.amount_received ?? intent.amount ?? 0;

  if (paidCents < expectedCents) {
    console.error(
      `[Stripe] Montant insuffisant pour la commande ${orderId} : ` +
      `${paidCents} centimes reçus pour ${expectedCents} attendus — commande NON validée.`
    );
    await paymentRepository.updateStatusByOrder(orderId, method, 'failed');
    return;
  }

  if (intent.currency && intent.currency.toLowerCase() !== 'chf') {
    console.error(`[Stripe] Devise inattendue (${intent.currency}) pour la commande ${orderId} — commande NON validée.`);
    return;
  }

  // Transaction : passage à "paid" + historique + mise à jour du paiement
  const { statusChanged } = await orderRepository.markPaidFromWebhook(orderId, intent.id, method);

  /* Le statut n'a pas bougé : soit la commande était déjà payée (retry Stripe,
     cas normal), soit elle n'était plus payable — annulée ou remboursée. Ce
     second cas mérite un signalement : de l'argent a été encaissé pour une
     commande qui ne sera pas honorée. */
  if (!statusChanged) {
    const current = await orderRepository.findById(orderId);
    if (current && current.status !== 'paid') {
      console.error(
        `[Stripe] Paiement reçu pour la commande ${orderId} au statut « ${current.status} » : ` +
        'elle ne peut plus être validée. Vérifier s\'il faut rembourser.'
      );
    }
    return;
  }

  /* Carte / Twint : le numéro de facture n'est attribué qu'au paiement accepté
     (CLI-07) — une tentative abandonnée n'en consomme plus. Sans effet sur une
     facture réglée par QR Twint, déjà numérotée à sa création. Avant les
     e-mails : la confirmation porte le numéro. */
  await orderService.numberInvoice(orderId);

  // Crédit des points de fidélité — hors transaction (processOrderEarning gère
  // ses propres transactions internes), et SEULEMENT si la commande vient de
  // passer à "paid". Combiné à l'idempotence sur event_id, garantit un crédit unique.
  const paidOrder = await orderRepository.findById(orderId);
  if (!paidOrder) return;

  await loyaltyService.processOrderEarning(paidOrder.user_id, orderId, paidOrder.total)
    .catch((err) => console.error('[Fidélité] Crédit points échoué :', err.message));

  /* Commande passée par carte / Twint : la confirmation n'est envoyée qu'à
     présent, paiement accepté (CLI-07). Une commande par facture réglée
     ensuite par un QR Twint a déjà reçu la sienne à sa création. */
  if (['card', 'twint'].includes(paidOrder.payment_method)) {
    orderService.sendOrderEmails(paidOrder, paidOrder.payment_method);

    /* Le panier avait été conservé pendant le paiement (CLI-13) : les articles
       payés en sortent maintenant. Échec non bloquant — la commande est payée,
       au pire la cliente retire elle-même un article resté dans son panier. */
    try {
      await cartRepository.removeOrderedItems(paidOrder.user_id, paidOrder.items);
    } catch (err) {
      console.error(`[Panier] Retrait des articles payés échoué (commande ${orderId}) :`, err.message);
    }
  }
};

/* Motif du refus, en français, pour l'historique de la commande.
   Stripe répond en anglais (« The PaymentIntent was declined by the provider… ») :
   ce texte brut s'affichait tel quel dans l'administration. Un code inconnu
   donne un libellé générique plutôt qu'un message anglais. */
const DECLINE_REASONS = {
  insufficient_funds:                    'fonds insuffisants',
  expired_card:                          'carte expirée',
  incorrect_cvc:                         'code de sécurité (CVC) incorrect',
  incorrect_number:                      'numéro de carte incorrect',
  lost_card:                             'carte déclarée perdue',
  stolen_card:                           'carte déclarée volée',
  card_velocity_exceeded:                'plafond de la carte atteint',
  authentication_required:               'authentification 3-D Secure non effectuée',
  payment_intent_authentication_failure: 'authentification 3-D Secure échouée',
  processing_error:                      'erreur technique de la banque',
};
const declineReason = (error, method) => {
  const known = DECLINE_REASONS[error?.decline_code] ?? DECLINE_REASONS[error?.code];
  if (known) return known;
  return method === 'twint' ? 'refusé ou annulé dans l\'app Twint' : 'refusé par la banque';
};

/* La commande passe à « Paiement refusé » (CLI-07), avec le motif du refus
   dans l'historique. La cliente peut encore réessayer avec une autre carte ;
   sans paiement, elle est annulée au bout de 2 h. */
const applyFailedIntent = async (intent) => {
  const orderId = parseInt(intent.metadata?.order_id);
  if (!orderId) return;

  const method = intent.payment_method_types?.includes('card') ? 'card' : 'twint';
  await paymentRepository.updateStatusByOrder(orderId, method, 'failed');

  await orderRepository.markPaymentFailed(
    orderId,
    `Paiement ${method === 'card' ? 'par carte' : 'Twint'} refusé : ${declineReason(intent.last_payment_error, method)}`
  );
};

// ─────────────────────────────────────────────────────────────
// État du paiement d'une commande — interrogé par le site au retour de la
// cliente (redirection Twint / 3-D Secure) et après un refus de carte.
//
// Stripe fait foi : si le paiement a abouti, la commande est validée sur-le-champ
// sans attendre le webhook ; s'il a été refusé, elle passe à « Paiement refusé ».
// Le webhook arrivant ensuite ne refait rien (traitements idempotents). Sans
// cette vérification, la page de retour ignorait l'issue du paiement et en
// redemandait un nouveau (CLI-15), et un refus de carte ne laissait aucune trace
// tant que le webhook n'était pas passé (CLI-07).
// `userId` : une cliente ne peut interroger que ses propres commandes (404 sinon).
// ─────────────────────────────────────────────────────────────
const syncOrderPayment = async (orderId, userId) => {
  let order = await orderRepository.findById(orderId, userId);
  if (!order) throw new AppError('Commande introuvable.', 404);

  let intentStatus = null;
  const method = order.payment_method;

  /* Une commande par facture peut être réglée par un QR Twint envoyé depuis
     l'admin : c'est ce paiement Twint qu'il faut vérifier. Sans cela, la
     cliente revenant d'un tel paiement lisait « Réglez votre facture sous
     30 jours », au risque de payer deux fois. */
  const intentMethod = method === 'invoice_qr' ? 'twint' : method;

  if (stripe && ['card', 'twint', 'invoice_qr'].includes(method)) {
    const intentId = await paymentRepository.findLatestIntentId(orderId, intentMethod);
    if (intentId) {
      let intent;
      try {
        intent = await stripe.paymentIntents.retrieve(intentId);
      } catch (err) {
        // Sans réponse de Stripe, on ne sait pas si la cliente a payé : surtout
        // ne pas lui laisser croire le contraire ni lui proposer de repayer.
        console.error(`[Stripe] Vérification du paiement impossible (commande ${orderId}) :`, err.message);
        throw new AppError('Impossible de vérifier le paiement pour le moment. Réessayez dans un instant.', 503);
      }
      intentStatus = intent.status;

      if (intent.status === 'succeeded' && order.status !== 'paid') {
        await applySucceededIntent(intent);
      } else if (
        intent.status === 'requires_payment_method'
        && intent.last_payment_error
        && order.status === 'awaiting_payment'
      ) {
        // Refus pas encore signalé par le webhook — une seule fois : ensuite la
        // commande est déjà à « Paiement refusé ».
        await applyFailedIntent(intent);
      }
      order = await orderRepository.findById(orderId, userId);
    }
  }

  return {
    orderStatus:   order.status,
    intentStatus,
    paymentMethod: method,
    total:         order.total,
    // N° de commande affiché à la cliente = n° de facture (attribué au paiement)
    invoiceNumber: order.invoice_number ?? null,
  };
};

/* ─────────────────────────────────────────────────────────────
   Détail de la transaction d'une commande (admin)
   Ce que la boutique sait (table payments) complété par Stripe : moyen exact,
   heure d'encaissement, frais, contrôle antifraude, remboursements. Stripe
   injoignable ne bloque rien : la fiche affiche alors les seules données locales.
   ───────────────────────────────────────────────────────────── */
const CARD_BRANDS = {
  visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', maestro: 'Maestro',
  discover: 'Discover', jcb: 'JCB', diners: 'Diners Club', unionpay: 'UnionPay',
};
const WALLETS = { apple_pay: 'Apple Pay', google_pay: 'Google Pay', samsung_pay: 'Samsung Pay', link: 'Link' };

const fromCents = (cents) => (cents == null ? null : Math.round(cents) / 100);
const fromUnix  = (seconds) => (seconds ? new Date(seconds * 1000) : null);

const describeStripeIntent = (intent) => {
  const charge  = intent.latest_charge && typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
  const details = charge?.payment_method_details ?? null;
  const card    = details?.card ?? null;
  const balance = charge?.balance_transaction && typeof charge.balance_transaction === 'object'
    ? charge.balance_transaction : null;

  return {
    intent_id:       intent.id,
    charge_id:       charge?.id ?? null,
    status:          intent.status,
    livemode:        !!intent.livemode,
    amount:          fromCents(intent.amount),
    amount_received: fromCents(intent.amount_received),
    amount_refunded: fromCents(charge?.amount_refunded ?? 0),
    currency:        (intent.currency ?? 'chf').toUpperCase(),
    created_at:      fromUnix(intent.created),
    paid_at:         charge?.paid ? fromUnix(charge.created) : null,
    method:          details?.type ?? intent.payment_method_types?.[0] ?? null,
    card: card ? {
      brand:     CARD_BRANDS[card.brand] ?? card.brand ?? null,
      last4:     card.last4 ?? null,
      exp_month: card.exp_month ?? null,
      exp_year:  card.exp_year ?? null,
      country:   card.country ?? null,
      wallet:    WALLETS[card.wallet?.type] ?? null,
      three_d_secure: card.three_d_secure?.result ?? null,
    } : null,
    risk_level:     charge?.outcome?.risk_level ?? null,
    network_status: charge?.outcome?.network_status ?? null,
    fee:            balance ? fromCents(balance.fee) : null,
    net:            balance ? fromCents(balance.net) : null,
    available_on:   balance ? fromUnix(balance.available_on) : null,
    receipt_url:    charge?.receipt_url ?? null,
    dashboard_url:  `https://dashboard.stripe.com/${intent.livemode ? '' : 'test/'}payments/${intent.id}`,
    // Motif du dernier refus, en français (le message de Stripe est en anglais)
    last_error: intent.last_payment_error ? {
      code:   intent.last_payment_error.decline_code ?? intent.last_payment_error.code ?? null,
      reason: declineReason(intent.last_payment_error, details?.type ?? intent.payment_method_types?.[0]),
    } : null,
  };
};

const getOrderTransaction = async (orderId) => {
  const order = await orderRepository.findById(orderId);
  if (!order) throw new AppError('Commande introuvable.', 404);

  const rows = await paymentRepository.findAllByOrderId(orderId);

  /* Tentatives affichées : paiements Stripe réels (identifiant connu) et QR
     Twint envoyés par e-mail. Les lignes « réservation » sans identifiant et la
     ligne interne du moyen choisi (facture, retrait) ne sont pas des tentatives. */
  const attempts = rows
    .filter((r) => r.provider_payment_id)
    .map((r) => ({
      id:         r.id,
      method:     r.method,
      status:     r.status,
      amount:     parseFloat(r.amount),
      created_at: r.created_at,
      reference:  r.provider_payment_id,
      via_email:  r.provider === 'stripe_qr_email',
    }));

  // Paiement Stripe à détailler : celui encaissé, sinon le dernier tenté (motif de refus)
  const settled = [...attempts].reverse().find((a) => a.status === 'succeeded');
  const target  = settled ?? attempts[attempts.length - 1] ?? null;

  let stripeDetails = null;
  let stripeUnavailable = false;
  if (target && stripe) {
    try {
      const intent = await stripe.paymentIntents.retrieve(
        target.reference,
        { expand: ['latest_charge.balance_transaction'] },
        { timeout: 8000 }
      );
      stripeDetails = describeStripeIntent(intent);
    } catch (err) {
      console.error(`[Stripe] Détail du paiement ${target.reference} (commande ${orderId}) indisponible :`, err.message);
      stripeUnavailable = true;
    }
  } else if (target) {
    stripeUnavailable = true;
  }

  const refunded = stripeDetails?.amount_refunded ?? 0;
  const received = stripeDetails?.amount_received ?? 0;
  let status = 'pending';
  if (refunded > 0) status = refunded >= received ? 'refunded' : 'partially_refunded';
  else if (order.paid_at) status = 'paid';
  else if (order.status === 'cancelled') status = 'cancelled';
  else if (order.status === 'payment_failed' || stripeDetails?.last_error) status = 'failed';

  return {
    status,
    method:       order.paid_method ?? order.payment_method,
    chosen_method: order.payment_method,
    paid_at:      order.paid_at,
    total:        parseFloat(order.total),
    invoice: order.payment_method === 'invoice_qr' ? {
      number:       order.invoice_number,
      qr_reference: order.qr_reference,
    } : null,
    stripe: stripeDetails,
    stripe_unavailable: stripeUnavailable,
    attempts,
  };
};

module.exports = {
  createCardIntent, createTwintIntent, createTwintQrForEmail, confirmQrPaymentReturn,
  handleWebhook, syncOrderPayment, getOrderTransaction,
};
