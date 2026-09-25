/* Stock d'un article (ADM-12) : des pièces, ou des CENTIMÈTRES pour un article
   vendu à la coupe (trame, bande à broder). La boutique le saisit et le lit en
   mètres à deux décimales : 2.15 m = 215 en base. Les quantités commandées de
   ces articles comptent des tronçons de `length_step_cm`. */

export const CM_PER_METER = 100
export const MAX_STOCK_METERS = 999999.99

const stepCmOf = (item) => Number(item?.length_step_cm) || 10

// Stock en base → valeur affichée dans le champ (mètres pour la coupe)
export function stockToInput(stock, soldByLength) {
  const value = Number(stock) || 0
  return soldByLength ? value / CM_PER_METER : value
}

// Valeur saisie → stock en base (centimètres pour la coupe)
export function stockFromInput(value, soldByLength) {
  const n = Number(value) || 0
  return soldByLength ? Math.round(n * CM_PER_METER) : n
}

// Stock dans l'unité de vente : pièces, ou mètres pour un article à la coupe
export function stockInSaleUnit(item) {
  return stockToInput(item?.stock, !!item?.sold_by_length)
}

// « 3 » pour des pièces, « 2.15 m » pour un article à la coupe
export function formatStock(item) {
  return item?.sold_by_length
    ? `${stockInSaleUnit(item).toFixed(2)} m`
    : String(stockInSaleUnit(item))
}

// Ligne de commande : « 60 cm » pour 6 tronçons de 10 cm, comme sur la facture
export function lineQuantityLabel(item) {
  return item?.sold_by_length ? `${(Number(item.quantity) || 0) * stepCmOf(item)} cm` : String(item?.quantity)
}

// Unité du prix facturé : « / 10 cm » pour un article à la coupe, rien sinon
export function lineUnitSuffix(item) {
  return item?.sold_by_length ? ` / ${stepCmOf(item)} cm` : ''
}

// Quantité commandée : « 0.60 m » pour 6 tronçons de 10 cm, le nombre de pièces sinon
export function formatQuantity(item, quantity) {
  return item?.sold_by_length
    ? `${((Number(quantity) || 0) * stepCmOf(item) / CM_PER_METER).toFixed(2)} m`
    : String(quantity)
}
