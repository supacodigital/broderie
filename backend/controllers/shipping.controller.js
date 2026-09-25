const { getShippingRate } = require('../utils/shipping.utils');

/**
 * Retourne le tarif de livraison CHF pour un montant d'articles donné (ADM-10).
 * Utilisé par le frontend pour afficher les frais avant confirmation de commande.
 * GET /api/v1/shipping/rates?amount=42.50
 */
const getRates = async (req, res, next) => {
  try {
    // Montant des articles TTC, avant code promo — le même que celui de la commande
    const amountChf = Math.max(0, parseFloat(req.query.amount) || 0);
    // Délai de la tranche, tel que réglé dans l'admin — il était figé à « 3–5 »
    const { priceChf, estimatedDays } = await getShippingRate(amountChf);

    res.json({
      success: true,
      data: {
        price_chf:      priceChf,
        currency:       'CHF',
        carrier:        'Swiss Post',
        estimated_days: estimatedDays,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getRates };
