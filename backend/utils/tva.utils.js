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

// Repli si un article n'a pas de snapshot de taux
const DEFAULT_RATE_PERCENT = 8.1;

// Arrondi au centime — la TVA se déclare au centime, l'arrondi à 0.05 ne vaut
// que pour les montants à payer (roundCHF)
const roundCents = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;

/* Répartit `amount` entre des parts proportionnelles à `weights`, au centime, en
   garantissant que la somme des parts redonne exactement `amount` : la dernière
   part reçoit le reste. Poids tous nuls → tout sur la dernière part. */
const splitProportionally = (amount, weights) => {
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  let allocated = 0;
  return weights.map((w, i) => {
    if (i === weights.length - 1) return roundCents(amount - allocated);
    const share = totalWeight > 0 ? roundCents(amount * w / totalWeight) : 0;
    allocated += share;
    return share;
  });
};

/* TVA d'une commande, ventilée par taux, FRAIS DE PORT COMPRIS (ADM-14).

   Les frais de port sont une prestation accessoire : ils suivent le taux de la
   marchandise livrée (Info TVA AFC). Ils ne sont pas hors champ — un colis de
   CHF 33.75 d'articles + CHF 11.25 de port à 8.1 % porte CHF 3.37 de TVA, pas
   CHF 2.53. Quand une commande mêle plusieurs taux, le port est réparti au
   prorata du montant des articles de chaque taux.

   C'est la SEULE source du montant de TVA : order.service la stocke à la
   création, la facture la réimprime. Deux calculs distincts finissaient par
   diverger de quelques centimes.

     items              : [{ unit_price, quantity, tax_rate_snapshot }] — prix TTC avant remise
     discountedSubtotal : montant TTC des articles APRÈS remise (orders.subtotal)
     shippingCost       : frais de port TTC (orders.shipping_cost)

   Retour : { total, parts: [{ ratePercent, itemsTTC, shippingTTC, baseTTC, tvaAmount, baseHT }] }
   parts triées par taux croissant, montants au centime. */
const computeOrderVat = ({ items = [], discountedSubtotal, shippingCost = 0 }) => {
  const groups = new Map();
  for (const item of items) {
    const parsed  = parseFloat(item.tax_rate_snapshot);
    const percent = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RATE_PERCENT;
    const lineTTC = parseFloat(item.unit_price) * (Number(item.quantity) || 0);
    groups.set(percent, (groups.get(percent) || 0) + (Number.isFinite(lineTTC) ? lineTTC : 0));
  }
  // Commande sans ligne détaillée (données anciennes) : taux normal sur le tout
  if (groups.size === 0) groups.set(DEFAULT_RATE_PERCENT, 0);

  const rates       = [...groups.keys()].sort((a, b) => a - b);
  const grossByRate = rates.map((r) => groups.get(r));
  const grossTotal  = grossByRate.reduce((s, v) => s + v, 0);

  // Remise répartie au prorata : chaque taux garde sa part du sous-total remisé
  const itemsTarget = roundCents(Number.isFinite(parseFloat(discountedSubtotal))
    ? parseFloat(discountedSubtotal)
    : grossTotal);
  const itemsByRate     = splitProportionally(itemsTarget, grossByRate);
  // Port au prorata des articles effectivement facturés ; remise de 100 % → au prorata du brut
  const shippingWeights = itemsTarget > 0 ? itemsByRate : grossByRate;
  const shippingByRate  = splitProportionally(roundCents(parseFloat(shippingCost) || 0), shippingWeights);

  const parts = rates.map((ratePercent, i) => {
    const baseTTC   = roundCents(itemsByRate[i] + shippingByRate[i]);
    const tvaAmount = roundCents(baseTTC * ratePercent / (100 + ratePercent));
    return {
      ratePercent,
      itemsTTC:    itemsByRate[i],
      shippingTTC: shippingByRate[i],
      baseTTC,
      tvaAmount,
      baseHT: roundCents(baseTTC - tvaAmount),
    };
  }).filter((p) => p.baseTTC !== 0 || rates.length === 1);

  return {
    total: roundCents(parts.reduce((s, p) => s + p.tvaAmount, 0)),
    parts,
  };
};

module.exports = { TVA_RATES, extractTVA, toHT, toTTC, computeOrderVat, roundCents };
