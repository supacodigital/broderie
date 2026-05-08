const orderService = require('../services/order.service');

const createOrder = async (req, res, next) => {
  try {
    const userId        = req.user.id;
    const sessionId     = req.cookies?.cartSession || null;
    const paymentMethod = req.body?.payment_method || 'twint';
    const couponCode    = req.body?.coupon_code?.trim() || null;
    const order = await orderService.createOrder({ userId, sessionId, paymentMethod, couponCode });
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

module.exports = { createOrder, getOrders, getOrderById };
