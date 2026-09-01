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

// Ventile la TVA d'une commande par taux distinct — obligation LTVA art. 26 :
// une facture doit indiquer le taux ET le montant de TVA pour chaque taux appliqué.
//   items         : [{ unit_price, quantity, tax_rate_snapshot }] — tax_rate_snapshot en % (ex. 8.10)
//   discountRatio  : part du sous-total conservée après remise (subtotalStocké / (subtotalStocké + remise)), 1 sinon
// Retour : [{ ratePercent, rateDecimal, baseTTC, tvaAmount }] trié par taux croissant, montants arrondis 0.05.
const DEFAULT_RATE_PERCENT = 8.1; // repli si un article n'a pas de snapshot de taux
const ventilateTVAByRate = (items = [], discountRatio = 1) => {
  const groups = new Map();

  for (const item of items) {
    const parsed  = parseFloat(item.tax_rate_snapshot);
    const percent = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RATE_PERCENT;
    const lineTTC = roundCHF(parseFloat(item.unit_price)) * (Number(item.quantity) || 0);
    groups.set(percent, (groups.get(percent) || 0) + lineTTC);
  }

  return [...groups.entries()]
    .map(([ratePercent, baseBrute]) => {
      const baseTTC = roundCHF(baseBrute * discountRatio);
      return {
        ratePercent,
        rateDecimal: ratePercent / 100,
        baseTTC,
        tvaAmount: extractTVA(baseTTC, ratePercent / 100),
      };
    })
    .sort((a, b) => a.ratePercent - b.ratePercent);
};

module.exports = { TVA_RATES, extractTVA, toHT, toTTC, ventilateTVAByRate };
