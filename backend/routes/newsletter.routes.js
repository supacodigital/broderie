const express = require('express');
const router = express.Router();
const newsletterController = require('../controllers/newsletter.controller');
const { validate } = require('../middlewares/validate');
const { subscribeSchema, unsubscribeSchema } = require('../validators/newsletter.validator');

router.post('/subscribe', validate(subscribeSchema), newsletterController.subscribe);
router.post('/unsubscribe', validate(unsubscribeSchema), newsletterController.unsubscribe);

module.exports = router;
