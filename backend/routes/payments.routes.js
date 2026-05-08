const express            = require('express');
const router             = express.Router();
const paymentController  = require('../controllers/payment.controller');
const { requireAuth }    = require('../middlewares/auth');
const { requireRole }    = require('../middlewares/roles');

// Webhook Stripe — corps brut obligatoire AVANT express.json()
// Cette route est montée avant le middleware JSON dans app.js
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  paymentController.stripeWebhook
);

// Checkout web — crée un PaymentIntent carte (client authentifié)
router.post('/card/:orderId', requireAuth, paymentController.createCardIntent);

// Checkout web — crée un PaymentIntent Twint (client authentifié)
router.post('/twint/:orderId', requireAuth, paymentController.createTwintIntent);

// Admin — envoie le QR Twint par email
router.post(
  '/twint/:orderId/send-email',
  requireAuth,
  requireRole('admin', 'super_admin'),
  paymentController.sendTwintQrByEmail
);

module.exports = router;
