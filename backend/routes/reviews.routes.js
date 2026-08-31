const express = require('express');
const router = express.Router({ mergeParams: true });
const reviewController = require('../controllers/review.controller');
const { requireAuth } = require('../middlewares/auth');
const { requireVerifiedEmail } = require('../middlewares/requireVerifiedEmail');

router.get('/', reviewController.getByProduct);
router.post('/', requireAuth, requireVerifiedEmail, reviewController.create);

module.exports = router;
