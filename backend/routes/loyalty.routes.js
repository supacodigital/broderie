const express = require('express');
const router = express.Router();
const loyaltyController = require('../controllers/loyalty.controller');
const { requireAuth } = require('../middlewares/auth');

/* Paliers actifs — route PUBLIQUE, déclarée avant requireAuth.
   La boutique doit savoir si un programme de fidélité existe pour l'annoncer sur
   les fiches produit, qui sont consultables sans être connecté. Ces paliers sont
   des informations commerciales publiques (seuil, récompense), au même titre que
   les prix — aucune donnée personnelle n'y figure. */
router.get('/tiers', loyaltyController.getTiers);

router.use(requireAuth);

router.get('/me', loyaltyController.getMe);
router.get('/me/rewards', loyaltyController.getRewards);

module.exports = router;
