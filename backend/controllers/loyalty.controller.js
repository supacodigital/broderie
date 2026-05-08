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

module.exports = { getMe, getRewards };
