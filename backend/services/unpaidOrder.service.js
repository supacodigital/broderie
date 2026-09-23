const stripe            = require('../config/stripe');
const orderRepository   = require('../repositories/order.repository');
const paymentRepository = require('../repositories/payment.repository');
const cartRepository    = require('../repositories/cart.repository');
const { AppError }      = require('../middlewares/errorHandler');

/* ─────────────────────────────────────────────────────────────
   Commandes carte / Twint restées impayées (CLI-07)

   La commande est créée avant le paiement (le stock doit être réservé pendant
   que la cliente saisit sa carte). Ce service la libère quand le paiement n'a
   pas abouti :
   - la cliente choisit un autre moyen de paiement ou revient au panier ;
   - elle repasse une nouvelle commande (l'ancienne retiendrait le stock et
     ferait échouer la nouvelle sur un article à exemplaire unique) ;
   - personne n'a payé au bout de 2 heures (tâche périodique).
   ───────────────────────────────────────────────────────────── */

// Délai au-delà duquel une commande carte / Twint impayée est annulée
const UNPAID_ORDER_TTL_MINUTES = 120;
// Fréquence de la tâche de nettoyage
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

/* Annule chez Stripe tous les paiements encore ouverts de la commande.
   Retourne false si l'un d'eux a déjà abouti (ou est en cours de traitement) :
   la commande a été payée, il ne faut surtout pas l'annuler — le webhook va la
   passer à « payée ». Retourne aussi false si Stripe est injoignable : on
   réessaiera au passage suivant plutôt que d'annuler une commande peut-être payée. */
const cancelStripeIntents = async (orderId) => {
  const intentIds = await paymentRepository.findOpenStripeIntentIds(orderId);
  if (intentIds.length === 0) return true;
  if (!stripe) return false;

  for (const intentId of intentIds) {
    try {
      const intent = await stripe.paymentIntents.retrieve(intentId);
      if (['succeeded', 'processing'].includes(intent.status)) return false;
      if (intent.status !== 'canceled') {
        await stripe.paymentIntents.cancel(intentId);
      }
    } catch (err) {
      // Paiement inconnu de ce compte Stripe (clé de test, environnement différent) :
      // il ne peut pas avoir été encaissé ici, l'annulation peut se poursuivre.
      if (err?.code === 'resource_missing') continue;
      console.error(`[Commandes impayées] Stripe injoignable pour la commande ${orderId} :`, err.message);
      return false;
    }
  }
  return true;
};

/* Remet les articles d'une commande annulée dans le panier de la cliente.
   Un article déjà présent n'est pas doublé. Le prix et le stock seront de toute
   façon recalculés et revérifiés à la prochaine commande. */
const restoreItemsToCart = async (userId, items) => {
  if (!userId || items.length === 0) return;
  const cart = await cartRepository.findCart({ userId });
  const cartId = cart?.id ?? await cartRepository.createCart({ userId });

  for (const item of items) {
    const existing = await cartRepository.findCartItem(cartId, item.product_id, item.variant_id);
    if (existing) continue;
    await cartRepository.addItem({
      cartId,
      productId:       item.product_id,
      variantId:       item.variant_id,
      quantity:        item.quantity,
      priceSnapshot:   item.unit_price,
      taxRateSnapshot: item.tax_rate_snapshot,
    });
  }
};

/* Annule une commande carte / Twint impayée. Sans effet (cancelled: false) si
   elle a été payée entre-temps ou n'est pas une commande en ligne impayée. */
const cancelUnpaidOrder = async (orderId, { note, userId = null, restoreCart = false }) => {
  const stripeCleared = await cancelStripeIntents(orderId);
  if (!stripeCleared) return { cancelled: false };

  const { cancelled, items } = await orderRepository.cancelUnpaidOnlineOrder(orderId, note);
  if (cancelled && restoreCart && userId) {
    await restoreItemsToCart(userId, items).catch((err) => {
      console.error(`[Commandes impayées] Panier non restauré (commande ${orderId}) :`, err.message);
    });
  }
  return { cancelled };
};

/* La cliente quitte l'étape de paiement sans payer : sa commande est annulée et
   ses articles reviennent dans son panier. La commande doit lui appartenir. */
const abandonByCustomer = async (orderId, userId) => {
  const order = await orderRepository.findById(orderId, userId);
  if (!order) throw new AppError('Commande introuvable.', 404);

  const { cancelled } = await cancelUnpaidOrder(orderId, {
    note:        'Paiement non effectué — annulée par la cliente (retour au panier)',
    userId,
    restoreCart: true,
  });
  if (!cancelled) {
    throw new AppError('Cette commande ne peut plus être annulée : son paiement a peut-être abouti.', 409);
  }
};

/* Une nouvelle commande est en cours pour cette cliente : ses commandes carte /
   Twint impayées précédentes sont libérées. Ne doit jamais bloquer la nouvelle
   commande — un échec est seulement journalisé. */
const releasePreviousUnpaidOrders = async (userId) => {
  try {
    const ids = await orderRepository.findUnpaidOnlineOrderIdsByUser(userId);
    for (const id of ids) {
      await cancelUnpaidOrder(id, { note: 'Paiement non effectué — remplacée par une nouvelle commande' });
    }
  } catch (err) {
    console.error('[Commandes impayées] Libération des commandes précédentes échouée :', err.message);
  }
};

// Tâche périodique : annule les commandes impayées depuis plus de 2 heures
const cancelExpiredUnpaidOrders = async () => {
  const ids = await orderRepository.findExpiredUnpaidOnlineOrderIds(UNPAID_ORDER_TTL_MINUTES);
  let count = 0;
  for (const id of ids) {
    const order = await orderRepository.findById(id);
    const { cancelled } = await cancelUnpaidOrder(id, {
      note:        'Paiement non reçu dans les 2 heures — annulée automatiquement',
      userId:      order?.user_id ?? null,
      restoreCart: true,
    });
    if (cancelled) count += 1;
  }
  if (count > 0) console.log(`[Commandes impayées] ${count} commande(s) annulée(s), stock remis en vente.`);
  return count;
};

// Démarre la tâche périodique — appelé une seule fois au lancement du serveur
const startUnpaidOrderSweeper = () => {
  const run = () => cancelExpiredUnpaidOrders().catch((err) => {
    console.error('[Commandes impayées] Tâche de nettoyage échouée :', err.message);
  });
  run();
  const timer = setInterval(run, SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
};

module.exports = {
  UNPAID_ORDER_TTL_MINUTES,
  cancelUnpaidOrder, abandonByCustomer, releasePreviousUnpaidOrders,
  cancelExpiredUnpaidOrders, startUnpaidOrderSweeper,
};
