/* Stock d'un article (ADM-12) : des pièces, ou des CENTIMÈTRES pour un article
   vendu à la coupe (trame, bande à broder). Dans ce cas la quantité du panier
   compte des tronçons de `length_step_cm` : 2.15 m en stock = 215, soit 21
   tronçons de 10 cm. */

const CM_PER_METER = 100
// Plafond d'une ligne de panier, identique à celui du serveur (cart.controller)
const MAX_LINE_QUANTITY = 999

const stepCmOf = (item) => Number(item?.length_step_cm) || 10

/* Quantité maximale commandable, dans l'unité de `quantity` (pièces ou tronçons).
   Article sur commande : fabriqué à la demande, son stock (souvent 0) ne borne
   rien — sans ce cas, le « + » du panier restait grisé dès la première unité. */
export function maxQuantityOf(item) {
  if (item?.is_made_to_order) return MAX_LINE_QUANTITY
  if (item?.stock == null) return Infinity
  const stock = Number(item.stock) || 0
  return item.sold_by_length ? Math.floor(stock / stepCmOf(item)) : stock
}

/* Quantité minimale d'une ligne : 1 pièce, ou le minimum de découpe exprimé en
   tronçons (50 cm = 5 tronçons de 10 cm). Sans cette borne, le « − » restait
   actif sous le minimum et le serveur refusait : bouton sans effet. */
export function minQuantityOf(item) {
  if (!item?.sold_by_length) return 1
  return Math.ceil((Number(item.length_min_cm) || 50) / stepCmOf(item))
}

// Quantité lisible : « 60 cm » pour 6 tronçons de 10 cm, le nombre de pièces sinon
export function lineQuantityLabel(item) {
  return item?.sold_by_length ? `${(Number(item.quantity) || 0) * stepCmOf(item)} cm` : String(item?.quantity)
}

// Unité du prix facturé : « / 10 cm » pour un article à la coupe, rien sinon
export function lineUnitSuffix(item) {
  return item?.sold_by_length ? ` / ${stepCmOf(item)} cm` : ''
}

// Stock dans l'unité de vente : pièces, ou mètres pour un article à la coupe
export function stockInSaleUnit(item) {
  const stock = Number(item?.stock) || 0
  return item?.sold_by_length ? stock / CM_PER_METER : stock
}

// « 3 » pour des pièces, « 2.15 m » pour un article à la coupe
export function formatStock(item) {
  return item?.sold_by_length
    ? `${stockInSaleUnit(item).toFixed(2)} m`
    : String(stockInSaleUnit(item))
}
