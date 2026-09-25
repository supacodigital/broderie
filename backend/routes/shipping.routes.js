const express            = require('express');
const router             = express.Router();
const shippingController = require('../controllers/shipping.controller');

/* Route publique — pas d'auth requise pour calculer les frais de port */
router.get('/rates', shippingController.getRates);
/* Localités d'un NPA suisse — préremplissage des formulaires d'adresse */
router.get('/localities/:zip', shippingController.getLocalities);

module.exports = router;
