const express = require('express');
const router  = express.Router();
const couponRepository = require('../repositories/coupon.repository');
const { roundCHF } = require('../utils/chf.utils');

/* Validation d'un code coupon — non authentifié (le total est envoyé par le client) */
router.post('/validate', async (req, res, next) => {
  try {
    const code  = req.body?.code?.trim();
    const total = parseFloat(req.body?.subtotal ?? 0);

    if (!code) {
      return res.status(400).json({ success: false, message: 'Code requis.' });
    }

    const result = await couponRepository.validate(code, total);
    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      data: {
        code:     result.coupon.code,
        type:     result.coupon.type,
        value:    parseFloat(result.coupon.value),
        discount: result.discount,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
