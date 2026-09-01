const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const { requireAuth } = require('../middlewares/auth');
const { requireVerifiedEmail } = require('../middlewares/requireVerifiedEmail');

// Toutes les routes commandes nécessitent une authentification
router.use(requireAuth);

// Passer commande exige une adresse email confirmée (anti-comptes jetables)
router.post('/', requireVerifiedEmail, orderController.createOrder);
router.get('/', orderController.getOrders);
router.get('/:id', orderController.getOrderById);
router.get('/:id/tracking', orderController.getTracking);
router.get('/:id/invoice', orderController.downloadInvoice);

module.exports = router;
