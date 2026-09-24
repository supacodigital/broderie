const express            = require('express');
const router             = express.Router();
const paymentController  = require('../controllers/payment.controller');
const { requireAuth }    = require('../middlewares/auth');

// Webhook Stripe — corps brut obligatoire AVANT express.json()
// Cette route est montée avant le middleware JSON dans app.js
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  paymentController.stripeWebhook
);

// Checkout web — crée un PaymentIntent carte (client authentifié)
router.post('/card/:orderId', requireAuth, paymentController.createCardIntent);

// Checkout web — crée un PaymentIntent Twint sans QR (client authentifié)
router.post('/twint/:orderId', requireAuth, paymentController.createTwintIntent);

// Checkout web — état du paiement au retour de la cliente (redirection Twint /
// 3-D Secure) : valide la commande si Stripe a encaissé, sans attendre le webhook
router.post('/sync/:orderId', requireAuth, paymentController.syncOrderPayment);

module.exports = router;
