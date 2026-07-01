const orderRepository   = require('../repositories/order.repository');
const cartRepository    = require('../repositories/cart.repository');
const userRepository    = require('../repositories/user.repository');
const paymentRepository = require('../repositories/payment.repository');
const couponRepository  = require('../repositories/coupon.repository');
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

  // Validation et application du coupon
  let discount    = 0;
  let couponId    = null;
  let couponApplied = null;
  if (couponCode) {
    const result = await couponRepository.validate(couponCode, subtotal);
    if (!result.valid) throw new AppError(result.error, 400);
    discount      = result.discount;
    couponId      = result.coupon.id;
    couponApplied = result.coupon.code;
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

  // Facture QR : génération d'une référence de paiement figée sur la commande
  const qrReference = paymentMethod === 'invoice_qr' ? invoiceService.generateQrReference() : null;

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
    qrReference,
    locale,
  });

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
