const express = require('express');
const router  = express.Router();
const consentController = require('../controllers/consent.controller');
const { optionalAuth } = require('../middlewares/optionalAuth');

// optionalAuth : capte req.user.id si le visiteur est connecté, sans bloquer les anonymes
router.post('/', optionalAuth, consentController.create);

module.exports = router;
