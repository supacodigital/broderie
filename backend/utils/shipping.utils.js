const settingsRepository = require('../repositories/settings.repository');
const { roundCHF }       = require('./chf.utils');

/* Tarif par défaut — utilisé si la table shipping_rates est vide */
const DEFAULT_SHIPPING_COST = 8.50;
const DEFAULT_ESTIMATED_DAYS = '3–5';

/* Tranche applicable à un montant (ADM-10 — « le modèle par tranches de poids
   est inadapté ») : la première dont le plafond couvre le montant des articles,
   tranches triées par plafond, la dernière sans plafond (NULL = au-delà). Seul
   le plafond compte — la borne basse est celle de la tranche précédente — pour
   qu'aucun montant ne tombe entre deux tranches. Sans tranche « au-delà »,
   la plus haute s'applique. */
const ceiling = (r) => (r.max_amount_chf === null || r.max_amount_chf === undefined
  ? Infinity
  : parseFloat(r.max_amount_chf));

const pickShippingRate = (rates, amountChf) => {
  if (!rates || rates.length === 0) return null;
  const sorted = [...rates].sort((a, b) => ceiling(a) - ceiling(b));
  const amount = Math.max(0, Number(amountChf) || 0);
  return sorted.find((r) => amount <= ceiling(r)) ?? sorted[sorted.length - 1];
};

/**
 * Tarif et délai de livraison pour un montant d'articles (CHF TTC, avant code promo).
 * Lit la grille en base, retombe sur le défaut si elle est vide.
 */
const getShippingRate = async (amountChf = 0) => {
  try {
    const rate = pickShippingRate(await settingsRepository.findAllShippingRates(), amountChf);
    if (!rate) return { priceChf: DEFAULT_SHIPPING_COST, estimatedDays: DEFAULT_ESTIMATED_DAYS };
    return {
      priceChf: roundCHF(parseFloat(rate.price_chf)),
      estimatedDays: rate.estimated_days || DEFAULT_ESTIMATED_DAYS,
    };
  } catch {
    return { priceChf: DEFAULT_SHIPPING_COST, estimatedDays: DEFAULT_ESTIMATED_DAYS };
  }
};

// Tarif de livraison en CHF pour un montant d'articles donné
const getShippingCost = async (amountChf = 0) => (await getShippingRate(amountChf)).priceChf;

module.exports = { getShippingCost, getShippingRate, pickShippingRate, DEFAULT_SHIPPING_COST };
