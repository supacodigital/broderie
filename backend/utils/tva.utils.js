const { roundCHF } = require('./chf.utils');

// Taux TVA suisse — les prix affichés sont toujours TTC
const TVA_RATES = {
  standard: 0.081,  // 8.1% — taux normal
  reduced: 0.026,   // 2.6% — taux réduit (alimentation, livres...)
  hotel: 0.038,     // 3.8% — taux hôtellerie
};

// Calcul de la part TVA incluse dans un montant TTC
// Formule : tva = montant_TTC × taux / (1 + taux)
const extractTVA = (amountTTC, rate) => {
  const tvaAmount = amountTTC * rate / (1 + rate);
  return roundCHF(tvaAmount);
};

// Calcul du montant HT depuis un TTC
const toHT = (amountTTC, rate) => roundCHF(amountTTC - extractTVA(amountTTC, rate));

// Calcul du montant TTC depuis un HT
const toTTC = (amountHT, rate) => roundCHF(amountHT * (1 + rate));

module.exports = { TVA_RATES, extractTVA, toHT, toTTC };
