const paymentService = require('../services/payment.service');
const { AppError }   = require('../middlewares/errorHandler');

// Crée un PaymentIntent carte et retourne le client_secret
const createCardIntent = async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.orderId);
    if (!orderId) return next(new AppError('orderId invalide.', 400));

    const result = await paymentService.createCardIntent(orderId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// Crée un PaymentIntent Twint et retourne le QR — checkout web
const createTwintIntent = async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.orderId);
    if (!orderId) return next(new AppError('orderId invalide.', 400));

    const result = await paymentService.createTwintIntent(orderId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// Envoi du QR Twint par email — action admin
const sendTwintQrByEmail = async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.orderId);
    if (!orderId) return next(new AppError('orderId invalide.', 400));

    const result = await paymentService.sendTwintQrByEmail(orderId, req.user.id);
    res.json({ success: true, data: result, message: 'QR Twint envoyé par email.' });
  } catch (error) {
    next(error);
  }
};

// Webhook Stripe — corps brut obligatoire pour la vérification de signature
const stripeWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) return res.status(400).json({ success: false, message: 'Signature manquante.' });

    await paymentService.handleWebhook(req.body, signature);
    res.json({ received: true });
  } catch (error) {
    // Renvoyer 400 pour les erreurs de signature — Stripe retentera sinon
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

module.exports = { createCardIntent, createTwintIntent, sendTwintQrByEmail, stripeWebhook };
