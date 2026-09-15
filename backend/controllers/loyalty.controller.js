const loyaltyService = require('../services/loyalty.service');

const getMe = async (req, res, next) => {
  try {
    const summary = await loyaltyService.getAccountSummary(req.user.id);
    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
};

const getRewards = async (req, res, next) => {
  try {
    const rewards = await loyaltyService.getRewards(req.user.id);
    res.json({ success: true, data: rewards });
  } catch (error) {
    next(error);
  }
};

/* Paliers actifs — accessible sans authentification (voir loyalty.routes.js).
   Sert à la boutique pour n'annoncer le programme que s'il existe réellement. */
const getTiers = async (req, res, next) => {
  try {
    const tiers = await loyaltyService.getActiveTiers();
    res.json({ success: true, data: tiers });
  } catch (error) {
    next(error);
  }
};

module.exports = { getMe, getRewards, getTiers };
