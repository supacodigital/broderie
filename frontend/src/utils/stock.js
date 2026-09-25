/* Stock d'un article (ADM-12) : des pièces, ou des CENTIMÈTRES pour un article
   vendu à la coupe (trame, bande à broder). Dans ce cas la quantité du panier
   compte des tronçons de `length_step_cm` : 2.15 m en stock = 215, soit 21
   tronçons de 10 cm. */

const CM_PER_METER = 100

const stepCmOf = (item) => Number(item?.length_step_cm) || 10

// Quantité maximale commandable, dans l'unité de `quantity` (pièces ou tronçons)
export function maxQuantityOf(item) {
  if (item?.stock == null) return Infinity
  const stock = Number(item.stock) || 0
  return item.sold_by_length ? Math.floor(stock / stepCmOf(item)) : stock
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
