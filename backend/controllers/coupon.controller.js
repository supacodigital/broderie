const orderService = require('../services/order.service');

/* Vérifie un code saisi au checkout et renvoie la remise à afficher.
   Accepte les coupons de la boutique ET les bons de fidélité de la cliente
   connectée — même règle que la création de commande (resolveDiscountCode).
   Seuls les coupons étaient vérifiés ici : un bon de fidélité était refusé
   (« Code invalide ou inactif ») et ne pouvait jamais être utilisé (ADM-03). */
const validate = async (req, res, next) => {
  try {
    const code  = req.body?.code?.trim();
    const total = parseFloat(req.body?.subtotal ?? 0);

    if (!code) {
      return res.status(400).json({ success: false, message: 'Code requis.' });
    }

    const resolved = await orderService.resolveDiscountCode({
      code,
      userId:   req.user?.id ?? null,
      subtotal: total,
    });

    res.json({
      success: true,
      data: {
        code:     resolved.code,
        type:     resolved.type,
        value:    resolved.value,
        discount: resolved.discount,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { validate };
