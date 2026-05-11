const orderService    = require('../services/order.service');
const orderRepository = require('../repositories/order.repository');
const { AppError }    = require('../middlewares/errorHandler');

const createOrder = async (req, res, next) => {
  try {
    const userId        = req.user.id;
    const sessionId     = req.cookies?.cartSession || null;
    const paymentMethod = req.body?.payment_method || 'twint';
    const couponCode    = req.body?.coupon_code?.trim() || null;
    const address       = req.body?.address ?? null;
    const order = await orderService.createOrder({ userId, sessionId, paymentMethod, couponCode, address });
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

const getOrders = async (req, res, next) => {
  try {
    const result = await orderService.getOrders(req.user.id, req.query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.id);
    const userId = req.user.id;
    const order = await orderService.getOrderById(orderId, userId);
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

/**
 * Retourne le numéro de suivi Swiss Post d'une commande.
 * Un client ne peut consulter que ses propres commandes.
 */
const getTracking = async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.id);
    const userId  = req.user.id;

    const order = await orderRepository.findById(orderId, userId);
    if (!order) return next(new AppError('Commande introuvable.', 404));

    if (!order.tracking_number) {
      return res.json({ success: true, data: { tracking_number: null, tracking_url: null } });
    }

    const trackingUrl = `https://www.post.ch/fr/outils/suivi-de-colis?track=${order.tracking_number}`;

    res.json({
      success: true,
      data: {
        tracking_number: order.tracking_number,
        tracking_url:    trackingUrl,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { createOrder, getOrders, getOrderById, getTracking };
