const express = require('express');
const router = express.Router();
const newsletterController = require('../controllers/newsletter.controller');
const { validate } = require('../middlewares/validate');
const { subscribeSchema, unsubscribeSchema, confirmSchema } = require('../validators/newsletter.validator');

router.post('/subscribe', validate(subscribeSchema), newsletterController.subscribe);
// Clic sur le lien reçu par e-mail — l'inscription devient effective (double opt-in)
router.post('/confirm', validate(confirmSchema), newsletterController.confirm);
router.post('/unsubscribe', validate(unsubscribeSchema), newsletterController.unsubscribe);

module.exports = router;
