const express = require('express');
const router = express.Router();
const loyaltyController = require('../controllers/loyalty.controller');
const { requireAuth } = require('../middlewares/auth');

router.use(requireAuth);

router.get('/me', loyaltyController.getMe);
router.get('/me/rewards', loyaltyController.getRewards);

module.exports = router;
