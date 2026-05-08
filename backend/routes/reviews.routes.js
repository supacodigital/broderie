const express = require('express');
const router = express.Router({ mergeParams: true });
const reviewController = require('../controllers/review.controller');
const { requireAuth } = require('../middlewares/auth');

router.get('/', reviewController.getByProduct);
router.post('/', requireAuth, reviewController.create);

module.exports = router;
