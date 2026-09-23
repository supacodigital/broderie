const express = require('express');
const router  = express.Router();
const { validate } = require('../controllers/coupon.controller');
const { optionalAuth } = require('../middlewares/optionalAuth');

// optionalAuth : un bon de fidélité n'est reconnu que pour la cliente connectée qui le possède
router.post('/validate', optionalAuth, validate);

module.exports = router;
