const orderRepository    = require('../repositories/order.repository');
const cartRepository     = require('../repositories/cart.repository');
const userRepository     = require('../repositories/user.repository');
const paymentRepository  = require('../repositories/payment.repository');
const couponRepository   = require('../repositories/coupon.repository');
const settingsRepository = require('../repositories/settings.repository');
const { AppError }       = require('../middlewares/errorHandler');
const { roundCHF }       = require('../utils/chf.utils');
const emailService       = require('./email.service');

const VALID_METHODS = ['twint', 'card', 'invoice'];

// Frais de port par défaut — remplacés par les taux DB si disponibles
const DEFAULT_SHIPPING_COST = 8.50;

const getShippingCost = async (weightKg = 0) => {
  try {
    const rates = await settingsRepository.findAllShippingRates();
    if (!rates || rates.length === 0) return DEFAULT_SHIPPING_COST;
    const matched = rates.find(
      r => weightKg >= parseFloat(r.min_weight) && weightKg <= parseFloat(r.max_weight)
    );
    return matched ? roundCHF(parseFloat(matched.price_chf)) : roundCHF(parseFloat(rates[0].price_chf));
  } catch {
    return DEFAULT_SHIPPING_COST;
  }
};

const createOrder = async ({ userId, sessionId, paymentMethod = 'twint', couponCode = null, address = null }) => {
  if (!VALID_METHODS.includes(paymentMethod)) {
    throw new AppError('Méthode de paiement invalide.', 400);
  }

  // Récupération du panier
  const cart = await cartRepository.findCart({ userId, sessionId });
  if (!cart) throw new AppError('Le panier est vide.', 400);

  const items = await cartRepository.findCartItems(cart.id);
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

  const totalWeightKg = activeItems.reduce((sum, item) => sum + (parseFloat(item.weight_kg ?? 0) * item.quantity), 0);
  const shippingCost = await getShippingCost(totalWeightKg);
  const total = roundCHF(discountedSubtotal + shippingCost);

  // Statut initial — toujours en attente de paiement Stripe
  const initialStatus = 'pending';

  const orderId = await orderRepository.createOrder({
    userId,
    items: activeItems,
    subtotal: discountedSubtotal,
    shippingCost,
    taxAmount,
    total,
    status: initialStatus,
    address,
    couponCode: couponApplied,
    discount,
    couponId,
    paymentMethod,
  });

  // Vider le panier après confirmation de la commande
  await cartRepository.clearCart(cart.id);

  const order = await orderRepository.findById(orderId);

  // Email de confirmation — non bloquant
  userRepository.findById(userId).then((user) => {
    if (!user) return;
    emailService.sendOrderConfirmation({ user, order }).catch((err) => {
      console.error('[Email] Confirmation commande non envoyée :', err.message);
    });
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
