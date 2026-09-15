const orderRepository   = require('../repositories/order.repository');
const cartRepository    = require('../repositories/cart.repository');
const userRepository    = require('../repositories/user.repository');
const paymentRepository = require('../repositories/payment.repository');
const couponRepository  = require('../repositories/coupon.repository');
const loyaltyRepository = require('../repositories/loyalty.repository');
const { AppError }      = require('../middlewares/errorHandler');
const { roundCHF }      = require('../utils/chf.utils');
const { getShippingCost } = require('../utils/shipping.utils');
const emailService      = require('./email.service');
const invoiceService    = require('./invoice.service');

const VALID_METHODS = ['card', 'twint', 'invoice_qr', 'pickup'];

// Statut initial de la commande selon la méthode de paiement choisie
const INITIAL_STATUS_BY_METHOD = {
  card:       'pending',          // paiement Stripe carte ensuite
  twint:      'pending',          // paiement Stripe Twint ensuite
  invoice_qr: 'pending_invoice',  // facture QR envoyée, paiement sous 30 jours
  pickup:     'pending_pickup',   // retrait + paiement en boutique
};

const createOrder = async ({ userId, sessionId, paymentMethod = 'twint', couponCode = null, address = null, billingAddress = null, locale = 'fr' }) => {
  if (!VALID_METHODS.includes(paymentMethod)) {
    throw new AppError('Méthode de paiement invalide.', 400);
  }

  // Récupération du panier
  const cart = await cartRepository.findCart({ userId, sessionId });
  if (!cart) throw new AppError('Le panier est vide.', 400);

  const items = await cartRepository.findCartItems(cart.id, locale);
  const activeItems = items.filter((item) => item.is_active && !item.deleted_at);

  if (activeItems.length === 0) throw new AppError('Le panier est vide.', 400);

  // Calcul du sous-total TTC
  const subtotal = roundCHF(
    activeItems.reduce((sum, item) => sum + parseFloat(item.price_snapshot) * item.quantity, 0)
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
    const result = await couponRepository.validate(couponCode, subtotal);
    if (result.valid) {
      discount      = result.discount;
      couponId      = result.coupon.id;
      couponApplied = result.coupon.code;
    } else {
      const rewardResult = await loyaltyRepository.validateReward(couponCode, userId, subtotal);
      if (!rewardResult.valid) {
        // On remonte l'erreur du bon si le code ressemble à un bon de fidélité
        // (message plus précis : « déjà utilisé », « expiré »), sinon celle du coupon.
        throw new AppError(rewardResult.error === 'Code invalide.' ? result.error : rewardResult.error, 400);
      }
      discount        = rewardResult.discount;
      couponApplied   = rewardResult.reward.code;
      loyaltyRewardId = rewardResult.reward.id;
    }
  }

  const discountedSubtotal = roundCHF(subtotal - discount);

  // TVA extraite du TTC après réduction (taux snapshot figé par article)
  const taxAmount = roundCHF(
    activeItems.reduce((sum, item) => {
      const rate       = parseFloat(item.tax_rate_snapshot) / 100;
      const proportion = (parseFloat(item.price_snapshot) * item.quantity) / subtotal;
      const lineTotal  = discountedSubtotal * proportion;
      return sum + (lineTotal * rate / (1 + rate));
    }, 0)
  );

  // Click & Collect : aucun envoi postal → frais de port à 0 (seule exception à la règle « frais toujours payants »)
  const isPickup = paymentMethod === 'pickup';
  const totalWeightKg = activeItems.reduce((sum, item) => sum + (parseFloat(item.weight_kg ?? 0) * item.quantity), 0);
  const shippingCost = isPickup ? 0 : await getShippingCost(totalWeightKg);
  const total = roundCHF(discountedSubtotal + shippingCost);

  // Statut initial selon la méthode (Stripe : pending — facture/retrait : statut dédié)
  const initialStatus = INITIAL_STATUS_BY_METHOD[paymentMethod] ?? 'pending';

  /* Facture QR : le numéro de facture et la référence de paiement sont attribués
     juste APRÈS la création (ils dépendent de l'identifiant de commande et du
     compteur mensuel). La commande part donc sans référence, puis la reçoit. */
  const isInvoiceOrder = paymentMethod === 'invoice_qr';

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
  });

  /* Numérotation de la facture : « 2026-09/01 », compteur remis à 1 chaque mois,
     et référence de paiement dérivée de ce numéro. Échec non bloquant — la
     commande existe et reste payable ; c'est la facture qui serait à régénérer. */
  if (isInvoiceOrder) {
    try {
      const assigned = await orderRepository.assignInvoiceNumber(orderId);
      const reference = invoiceService.generateQrReference(assigned?.invoiceSeq ?? null);
      await orderRepository.saveQrReference(orderId, reference);
    } catch (err) {
      console.error('[Facture] Numérotation échouée — commande', orderId, ':', err.message);
    }
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

  // Vider le panier après confirmation de la commande
  await cartRepository.clearCart(cart.id);

  const order = await orderRepository.findById(orderId);

  // Emails — non bloquants
  userRepository.findById(userId).then((user) => {
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

  return order;
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

module.exports = { createOrder, getOrders, getOrderById };
