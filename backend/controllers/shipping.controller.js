const { getShippingRate } = require('../utils/shipping.utils');
const { SWISS_ZIP_REGEX, POSTAL_MESSAGES, findLocalities } = require('../utils/postalAddress.utils');

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

/**
 * Localités desservies par un NPA suisse — préremplit la localité et le canton
 * des formulaires d'adresse. Liste officielle swisstopo, Suisse uniquement.
 * GET /api/v1/shipping/localities/1510 → [{ city: 'Moudon', canton: 'VD' }, { city: 'Syens', canton: 'VD' }]
 * NPA hors Suisse ou inexistant → liste vide (réponse normale d'une recherche,
 * pas une erreur : un 404 s'afficherait en rouge dans la console du navigateur).
 */
const getLocalities = (req, res) => {
  const zip = String(req.params.zip ?? '').trim();
  if (!SWISS_ZIP_REGEX.test(zip)) {
    return res.status(400).json({ success: false, message: POSTAL_MESSAGES.zip });
  }
  // Donnée publique et stable (mise à jour mensuelle) : le navigateur la garde un jour
  res.set('Cache-Control', 'public, max-age=86400');
  res.json({ success: true, data: findLocalities(zip) });
};

module.exports = { getRates, getLocalities };
