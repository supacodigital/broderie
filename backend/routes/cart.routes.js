const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cart.controller');
const { optionalAuth } = require('../middlewares/optionalAuth');

// Auth optionnelle — fonctionne pour les visiteurs anonymes et les utilisateurs connectés
router.use(optionalAuth);

router.get('/', cartController.getCart);
router.post('/items', cartController.addItem);
router.put('/items/:id', cartController.updateItem);
router.delete('/items/:id', cartController.removeItem);

module.exports = router;
