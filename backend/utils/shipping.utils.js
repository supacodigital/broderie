const settingsRepository = require('../repositories/settings.repository');
const { roundCHF }       = require('./chf.utils');

/* Tarif par défaut — utilisé si la table shipping_rates est vide */
const DEFAULT_SHIPPING_COST = 8.50;

/**
 * Retourne le tarif de livraison en CHF pour un poids donné.
 * Lit les tranches depuis shipping_rates en base, retombe sur le défaut si vide.
 */
const getShippingCost = async (weightKg = 0) => {
  try {
    const rates = await settingsRepository.findAllShippingRates();
    if (!rates || rates.length === 0) return DEFAULT_SHIPPING_COST;
    const matched = rates.find(
      r => weightKg >= parseFloat(r.min_weight) && weightKg <= parseFloat(r.max_weight)
    );
    return matched
      ? roundCHF(parseFloat(matched.price_chf))
      : roundCHF(parseFloat(rates[0].price_chf));
  } catch {
    return DEFAULT_SHIPPING_COST;
  }
};

module.exports = { getShippingCost, DEFAULT_SHIPPING_COST };
