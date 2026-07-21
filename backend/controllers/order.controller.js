const { z }           = require('zod');
const orderService    = require('../services/order.service');
const orderRepository = require('../repositories/order.repository');
const userRepository  = require('../repositories/user.repository');
const invoiceService  = require('../services/invoice.service');
const { AppError }    = require('../middlewares/errorHandler');
const { localeFromRequest } = require('../utils/locale.utils');

// Cantons suisses officiels (2 lettres) — validation stricte de l'adresse
const SWISS_CANTONS = ['AG','AI','AR','BE','BL','BS','FR','GE','GL','GR','JU','LU','NE','NW','OW','SG','SH','SO','SZ','TG','TI','UR','VD','VS','ZG','ZH'];

// Schéma d'adresse figée à la commande — validé côté serveur (jamais faire confiance au client)
const addressSchema = z.object({
  first_name:    z.string().trim().min(1).max(100),
  last_name:     z.string().trim().min(1).max(100),
  street:        z.string().trim().min(1).max(255),
  street_number: z.string().trim().max(20).optional().nullable(),
  zip:        z.string().regex(/^\d{4}$/),
  city:       z.string().trim().min(1).max(100),
  canton:     z.enum(SWISS_CANTONS),
  phone:      z.string().trim().max(30).optional(),
});

const createOrderSchema = z.object({
  payment_method:  z.string().optional(),
  coupon_code:     z.string().optional().nullable(),
  address:         addressSchema,
  // Adresse de facturation optionnelle — si absente, identique à la livraison
  billing_address: addressSchema.optional().nullable(),
  items:           z.any(),
});

const createOrder = async (req, res, next) => {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Données de commande invalides.' });
    }

    const userId         = req.user.id;
    const sessionId      = req.cookies?.cartSession || null;
    const paymentMethod  = parsed.data.payment_method || 'twint';
    const couponCode     = parsed.data.coupon_code?.trim() || null;
    const address        = parsed.data.address;
    const billingAddress = parsed.data.billing_address ?? null;
    const order = await orderService.createOrder({ userId, sessionId, paymentMethod, couponCode, address, billingAddress, locale: localeFromRequest(req) });
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
