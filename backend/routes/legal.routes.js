const express = require('express');
const router = express.Router();
const settingsRepository = require('../repositories/settings.repository');

/* ── GET /api/v1/legal — textes légaux publics (sans auth) ── */
router.get('/', async (req, res, next) => {
  try {
    const data = await settingsRepository.findSettings(settingsRepository.LEGAL_KEYS);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
