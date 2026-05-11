const express            = require('express');
const router             = express.Router();
const shippingController = require('../controllers/shipping.controller');

/* Route publique — pas d'auth requise pour calculer les frais de port */
router.get('/rates', shippingController.getRates);

module.exports = router;
