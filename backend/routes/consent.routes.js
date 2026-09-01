const express = require('express');
const router  = express.Router();
const consentController = require('../controllers/consent.controller');
const { optionalAuth } = require('../middlewares/optionalAuth');
const { validate } = require('../middlewares/validate');
const { consentSchema } = require('../validators/consent.validator');

// optionalAuth : capte req.user.id si le visiteur est connecté, sans bloquer les anonymes
router.post('/', optionalAuth, validate(consentSchema), consentController.create);

module.exports = router;
