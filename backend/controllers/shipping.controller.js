const { getShippingCost } = require('../utils/shipping.utils');

/**
 * Retourne le tarif de livraison CHF pour un poids donné.
 * Utilisé par le frontend pour afficher les frais avant confirmation de commande.
 * GET /api/v1/shipping/rates?weight=0.5
 */
const getRates = async (req, res, next) => {
  try {
    const weightKg = parseFloat(req.query.weight) || 0;
    const priceChf = await getShippingCost(weightKg);

    res.json({
      success: true,
      data: {
        price_chf:      priceChf,
        currency:       'CHF',
        carrier:        'Swiss Post',
        estimated_days: '1–2',
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getRates };
