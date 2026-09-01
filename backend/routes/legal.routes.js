const express = require('express');
const router = express.Router();
const legalController = require('../controllers/legal.controller');

// GET /api/v1/legal — textes légaux publics (sans auth)
router.get('/', legalController.getLegalTexts);

module.exports = router;
