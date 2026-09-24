const { roundCHF } = require('./chf.utils');

/* Articles vendus « en action » sur une commande (CLI-14).

   Le prix normal (barré) d'un article est figé dans le snapshot de la ligne de
   commande au moment de l'achat (`compare_price_chf`, NULL hors action). Il
   est au mètre pour la vente à la coupe, alors que le prix facturé est au
   tronçon : on le ramène à la même unité. Une seule définition, partagée par la
   facture, l'e-mail de confirmation et le détail de commande de la cliente. */

// Prix normal à l'unité facturée, ou null si l'article n'était pas en action
const compareUnitPrice = (snapshot, item) => {
  const compare = parseFloat(snapshot?.compare_price_chf);
  if (!Number.isFinite(compare) || compare <= 0) return null;
  const perUnit = Number(item.sold_by_length) === 1
    ? compare * (Number(item.length_step_cm) || 10) / 100
    : compare;
  const normal = roundCHF(perUnit);
  return normal > roundCHF(parseFloat(item.unit_price)) ? normal : null;
};

// Remise en pour cent (0 hors action)
const salePercent = (unitPrice, normalPrice) => {
  const unit = parseFloat(unitPrice);
  const normal = parseFloat(normalPrice);
  if (!Number.isFinite(unit) || !Number.isFinite(normal) || normal <= unit) return 0;
  return Math.round((1 - unit / normal) * 100);
};

module.exports = { compareUnitPrice, salePercent };
