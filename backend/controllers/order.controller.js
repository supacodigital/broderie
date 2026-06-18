const orderService    = require('../services/order.service');
const orderRepository = require('../repositories/order.repository');
const userRepository  = require('../repositories/user.repository');
const invoiceService  = require('../services/invoice.service');
const { AppError }    = require('../middlewares/errorHandler');
const { localeFromRequest } = require('../utils/locale.utils');

const createOrder = async (req, res, next) => {
  try {
    const userId        = req.user.id;
    const sessionId     = req.cookies?.cartSession || null;
    const paymentMethod = req.body?.payment_method || 'twint';
    const couponCode    = req.body?.coupon_code?.trim() || null;
    const address       = req.body?.address ?? null;
    const order = await orderService.createOrder({ userId, sessionId, paymentMethod, couponCode, address, locale: localeFromRequest(req) });
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

/**
 * Télécharge la facture QR PDF d'une commande.
 * Un client ne peut télécharger que la facture de SES propres commandes facture QR.
 */
const downloadInvoice = async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.id);
    const userId  = req.user.id;

    const order = await orderRepository.findById(orderId, userId);
    if (!order) return next(new AppError('Commande introuvable.', 404));

    // Seules les commandes payées par facture QR disposent d'une facture téléchargeable
    if (order.payment_method !== 'invoice_qr') {
      return next(new AppError('Aucune facture disponible pour cette commande.', 404));
    }

    const user = await userRepository.findById(order.user_id);
    if (!user) return next(new AppError('Client introuvable.', 404));

    const pdfBuffer = await invoiceService.getInvoicePdf({ order, user });

    const filename = `facture-${String(order.id).padStart(6, '0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

module.exports = { createOrder, getOrders, getOrderById, getTracking, downloadInvoice };
