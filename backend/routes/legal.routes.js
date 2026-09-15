const express = require('express');
const router = express.Router();
const legalController = require('../controllers/legal.controller');

// GET /api/v1/legal — textes légaux publics (sans auth)
router.get('/', legalController.getLegalTexts);

// GET /api/v1/legal/banner — bandeau d'annonce de la boutique (sans auth)
router.get('/banner', legalController.getBanner);

module.exports = router;
