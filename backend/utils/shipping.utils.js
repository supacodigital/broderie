const settingsRepository = require('../repositories/settings.repository');
const { roundCHF }       = require('./chf.utils');

/* Tarif par défaut — utilisé si la table shipping_rates est vide */
const DEFAULT_SHIPPING_COST = 8.50;
const DEFAULT_ESTIMATED_DAYS = '3–5';

/* Tranche applicable à un poids (ADM-10) : la première dont le plafond couvre
   le poids, tranches triées par plafond. Seul le plafond compte — la borne
   basse est celle de la tranche précédente — pour qu'aucun poids ne tombe
   « entre deux tranches » : 100.4 g, entre 0.100 et 0.101 kg, ne correspondait
   à aucune ligne et repartait au tarif le moins cher.
   Au-delà de la dernière tranche, la plus lourde s'applique : un colis de 31 kg
   était facturé au tarif d'une lettre. */
const pickShippingRate = (rates, weightKg) => {
  if (!rates || rates.length === 0) return null;
  const sorted = [...rates].sort((a, b) => parseFloat(a.max_weight) - parseFloat(b.max_weight));
  const weight = Math.max(0, Number(weightKg) || 0);
  return sorted.find((r) => weight <= parseFloat(r.max_weight)) ?? sorted[sorted.length - 1];
};

/**
 * Tarif et délai de livraison pour un poids donné.
 * Lit les tranches depuis shipping_rates en base, retombe sur le défaut si vide.
 */
const getShippingRate = async (weightKg = 0) => {
  try {
    const rate = pickShippingRate(await settingsRepository.findAllShippingRates(), weightKg);
    if (!rate) return { priceChf: DEFAULT_SHIPPING_COST, estimatedDays: DEFAULT_ESTIMATED_DAYS };
    return {
      priceChf: roundCHF(parseFloat(rate.price_chf)),
      estimatedDays: rate.estimated_days || DEFAULT_ESTIMATED_DAYS,
    };
  } catch {
    return { priceChf: DEFAULT_SHIPPING_COST, estimatedDays: DEFAULT_ESTIMATED_DAYS };
  }
};

/**
 * Retourne le tarif de livraison en CHF pour un poids donné.
 */
const getShippingCost = async (weightKg = 0) => (await getShippingRate(weightKg)).priceChf;

module.exports = { getShippingCost, getShippingRate, pickShippingRate, DEFAULT_SHIPPING_COST };
