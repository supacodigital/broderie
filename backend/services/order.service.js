const orderRepository   = require('../repositories/order.repository');
const cartRepository    = require('../repositories/cart.repository');
const userRepository    = require('../repositories/user.repository');
const paymentRepository = require('../repositories/payment.repository');
const couponRepository  = require('../repositories/coupon.repository');
const loyaltyRepository = require('../repositories/loyalty.repository');
const { AppError }      = require('../middlewares/errorHandler');
const { roundCHF }      = require('../utils/chf.utils');
const { computeOrderVat } = require('../utils/tva.utils');
const { getShippingCost } = require('../utils/shipping.utils');
const emailService      = require('./email.service');
const invoiceService    = require('./invoice.service');
const unpaidOrderService = require('./unpaidOrder.service');

const VALID_METHODS = ['card', 'twint', 'invoice_qr', 'pickup'];

// Statut initial de la commande selon la méthode de paiement choisie
/* Carte et Twint : la commande attend son paiement Stripe. Elle naissait
   auparavant au statut `pending`, compté dans « À traiter » côté admin — une
   carte refusée y apparaissait comme une vraie commande (CLI-07). */
const INITIAL_STATUS_BY_METHOD = {
  card:       'awaiting_payment', // paiement Stripe carte ensuite
  twint:      'awaiting_payment', // paiement Stripe Twint ensuite
  invoice_qr: 'pending_invoice',  // facture QR envoyée, paiement sous 30 jours
  pickup:     'pending_pickup',   // retrait + paiement en boutique
};

/* Résout un code saisi dans le champ « code promo » : un coupon créé par la
   boutique, ou un bon de fidélité de la cliente. Source UNIQUE de cette règle,
   partagée par la vérification au checkout (coupon.controller) et la création
   de commande : quand les deux divergeaient, un bon de fidélité était refusé
   au checkout alors que la commande l'aurait accepté (ADM-03).
   Lève une AppError 400 avec le message à afficher si le code est refusé. */
const resolveDiscountCode = async ({ code, userId, subtotal }) => {
  const result = await couponRepository.validate(code, subtotal);
  if (result.valid) {
    return {
      discount:        result.discount,
      code:            result.coupon.code,
      type:            result.coupon.type,
      value:           parseFloat(result.coupon.value),
      couponId:        result.coupon.id,
      loyaltyRewardId: null,
    };
  }

  const rewardResult = await loyaltyRepository.validateReward(code, userId, subtotal);
  if (!rewardResult.valid) {
    // On remonte l'erreur du bon si le code ressemble à un bon de fidélité
    // (message plus précis : « déjà utilisé », « expiré »), sinon celle du coupon.
    throw new AppError(rewardResult.error === 'Code invalide.' ? result.error : rewardResult.error, 400);
  }
  return {
    discount:        rewardResult.discount,
    code:            rewardResult.reward.code,
    type:            rewardResult.reward.type,
    value:           parseFloat(rewardResult.reward.value),
    couponId:        null,
    loyaltyRewardId: rewardResult.reward.id,
  };
};

const createOrder = async ({ userId, sessionId, paymentMethod = 'twint', couponCode = null, address = null, billingAddress = null, locale = 'fr', wantsPrintedInvoice = false }) => {
  if (!VALID_METHODS.includes(paymentMethod)) {
    throw new AppError('Méthode de paiement invalide.', 400);
  }

  // Récupération du panier
  const cart = await cartRepository.findCart({ userId, sessionId });
  if (!cart) throw new AppError('Le panier est vide.', 400);

  const items = await cartRepository.findCartItems(cart.id, locale);
  const activeItems = items.filter((item) => item.is_active && !item.deleted_at);

  if (activeItems.length === 0) throw new AppError('Le panier est vide.', 400);

  /* Une commande carte / Twint précédente restée impayée retient encore son
     stock : sans cette libération, la cliente dont la carte a été refusée et
     qui recommence se voyait refuser un article à exemplaire unique pour
     « stock insuffisant » — bloqué par sa propre commande. */
  if (userId) await unpaidOrderService.releasePreviousUnpaidOrders(userId);

  /* Calcul du sous-total TTC sur `unit_price` — le prix courant recalculé par
     cart.repository (promotion en cours prise en compte), et non `price_snapshot`
     figé à l'ajout au panier. C'est ce même montant qui est affiché à la cliente
     au récapitulatif : facturer le snapshot ferait payer un prix différent de
     celui annoncé dès qu'une promo a démarré ou expiré entre-temps. */
  const subtotal = roundCHF(
    activeItems.reduce((sum, item) => sum + parseFloat(item.unit_price) * item.quantity, 0)
  );

  // Validation et application du code de réduction.
  // Deux sources possibles derrière un même champ « code promo » côté client :
  // la table `coupons` (codes créés par l'admin) et `loyalty_rewards` (bons générés
  // par le programme de fidélité). On essaie les coupons d'abord, puis les bons —
  // sans ce second essai, un bon annoncé au client par email serait refusé au panier.
  let discount        = 0;
  let couponId        = null;
  let couponApplied   = null;
  let loyaltyRewardId = null;
  if (couponCode) {
    const resolved = await resolveDiscountCode({ code: couponCode, userId, subtotal });
    discount        = resolved.discount;
    couponId        = resolved.couponId;
    couponApplied   = resolved.code;
    loyaltyRewardId = resolved.loyaltyRewardId;
  }

  const discountedSubtotal = roundCHF(subtotal - discount);

  // Click & Collect : aucun envoi postal → frais de port à 0 (seule exception à la règle « frais toujours payants »)
  const isPickup = paymentMethod === 'pickup';
  /* Poids réel de la commande.
     Article vendu à la coupe : `weight_kg` est le poids AU MÈTRE et `quantity`
     un nombre de tronçons — 60 cm doivent peser 0.6 m, pas 6 m. Sans cette
     conversion, les frais de port Swiss Post étaient surévalués d'un facteur 10. */
  const totalWeightKg = activeItems.reduce((sum, item) => {
    const w = parseFloat(item.weight_kg ?? 0);
    if (!item.sold_by_length) return sum + w * item.quantity;
    const stepCm = Number(item.length_step_cm) || 10;
    return sum + (w * item.quantity * stepCm) / 100;
  }, 0);
  const shippingCost = isPickup ? 0 : await getShippingCost(totalWeightKg);
  const total = roundCHF(discountedSubtotal + shippingCost);

  /* TVA incluse, frais de port compris (ADM-14) — le port suit le taux des
     articles livrés. Même calcul que celui réimprimé sur la facture. */
  const taxAmount = computeOrderVat({
    items: activeItems,
    discountedSubtotal,
    shippingCost,
  }).total;

  // Statut initial selon la méthode (Stripe : pending — facture/retrait : statut dédié)
  const initialStatus = INITIAL_STATUS_BY_METHOD[paymentMethod] ?? 'pending';

  /* Le numéro de facture et la référence de paiement sont attribués juste APRÈS
     la création : ils dépendent de l'identifiant de commande et du compteur
     annuel. La commande part donc sans référence, puis la reçoit.

     Toute commande est numérotée, quel que soit son moyen de paiement. Seules
     les commandes par facture QR l'étaient auparavant : une commande réglée par
     carte pouvait malgré tout donner lieu à une facture depuis l'administration,
     qui portait alors un numéro dérivé de l'identifiant de commande. Ce numéro
     de repli finissait par rattraper le compteur, et deux factures distinctes
     auraient porté le même numéro — une faute comptable. */

  const orderId = await orderRepository.createOrder({
    userId,
    items: activeItems,
    subtotal: discountedSubtotal,
    shippingCost,
    taxAmount,
    total,
    status: initialStatus,
    address,
    billingAddress,
    couponCode: couponApplied,
    discount,
    couponId,
    paymentMethod,
    qrReference: null,
    locale,
    wantsPrintedInvoice,
  });

  /* Numérotation de la facture : « 2026-000001 », compteur remis à 1 chaque
     1er janvier, et référence de paiement dérivée de ce numéro. Échec non
     bloquant — la commande existe et reste payable ; c'est la facture qui
     serait à régénérer. */
  try {
    const assigned = await orderRepository.assignInvoiceNumber(orderId);
    const reference = invoiceService.generateQrReference(
      assigned?.invoiceSeq ?? null,
      assigned?.year ?? new Date().getFullYear()
    );
    await orderRepository.saveQrReference(orderId, reference);
  } catch (err) {
    console.error('[Facture] Numérotation échouée — commande', orderId, ':', err.message);
  }

  // Consommation du bon de fidélité — après création de la commande (on a besoin de
  // l'orderId pour tracer la transaction 'redeem'). Échec non bloquant : la commande
  // est déjà créée et payable, on ne la perd pas pour un bon non décompté — mais on
  // le journalise, c'est une incohérence à rattraper manuellement.
  if (loyaltyRewardId) {
    try {
      const redeemed = await loyaltyRepository.redeemReward(loyaltyRewardId, userId, orderId, discount);
      if (!redeemed) {
        console.error('[Fidélité] Bon non consommé (déjà utilisé ?) — commande', orderId, 'bon', loyaltyRewardId);
      }
    } catch (err) {
      console.error('[Fidélité] Consommation du bon échouée — commande', orderId, ':', err.message);
    }
  }

  /* Vider le panier — sauf pour la carte et Twint, où il est conservé jusqu'au
     paiement (CLI-13) : vidé dès la création de la commande, il apparaissait
     vide à la cliente qui revenait à la boutique depuis l'étape de paiement.
     Les articles payés en sont retirés à l'acceptation du paiement
     (payment.service), et une nouvelle commande libère l'ancienne restée
     impayée (releasePreviousUnpaidOrders, plus haut). */
  if (!ONLINE_METHODS.includes(paymentMethod)) {
    await cartRepository.clearCart(cart.id);
  }

  const order = await orderRepository.findById(orderId);

  /* Carte / Twint : aucune confirmation tant que le paiement n'est pas accepté.
     Elle partait jusqu'ici dès la création — une cliente dont la carte était
     refusée recevait « commande confirmée », et Julie une notification de
     commande à préparer. Les e-mails partent désormais du webhook Stripe
     (voir sendOrderEmails, appelé par payment.service). */
  if (!ONLINE_METHODS.includes(paymentMethod)) {
    sendOrderEmails(order, paymentMethod);
  }

  return order;
};

const ONLINE_METHODS = ['card', 'twint'];

/* E-mails d'une commande validée — confirmation cliente, notification boutique,
   et facture QR en pièce jointe pour ce moyen de paiement. Non bloquants. */
const sendOrderEmails = (order, paymentMethod) => {
  userRepository.findById(order.user_id).then((user) => {
    if (!user) return;

    // Email de confirmation systématique
    emailService.sendOrderConfirmation({ user, order }).catch((err) => {
      console.error('[Email] Confirmation commande non envoyée :', err.message);
    });

    // Notification interne boutique — n'envoie rien si MAIL_CONTACT n'est pas configuré
    emailService.sendAdminOrderNotification({ user, order }).catch((err) => {
      console.error('[Email] Notification admin non envoyée :', err.message);
    });

    // Facture QR : email dédié avec la QR-facture suisse en pièce jointe PDF
    if (paymentMethod === 'invoice_qr') {
      invoiceService.sendInvoiceEmail({ user, order }).catch((err) => {
        console.error('[Email] Facture QR non envoyée :', err.message);
      });
    }
  }).catch(() => {});
};

const getOrders = async (userId, query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(50, parseInt(query.limit) || 20);

  const { rows, total } = await orderRepository.findByUserId(userId, { page, limit });

  return {
    data: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getOrderById = async (orderId, userId) => {
  const order = await orderRepository.findById(orderId, userId);
  if (!order) throw new AppError('Commande introuvable.', 404);
  return order;
};

module.exports = { createOrder, getOrders, getOrderById, sendOrderEmails, resolveDiscountCode };
