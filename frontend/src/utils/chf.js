/* Arrondi au 0.05 CHF le plus proche — règle légale suisse */
export function roundCHF(amount) {
  return Math.round(parseFloat(amount) * 20) / 20
}

/* Formatage avec apostrophe suisse et deux décimales — ex: CHF 1'289.90 */
export function formatCHF(amount) {
  const rounded = roundCHF(amount)
  return 'CHF ' + rounded.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/* Remise d'un article en action, en pour cent (CLI-14) — 0 hors action.
   `comparePrice` : prix normal barré, à la même unité que `unitPrice`. */
export function salePercent(unitPrice, comparePrice) {
  const unit = parseFloat(unitPrice)
  const normal = parseFloat(comparePrice)
  if (!Number.isFinite(unit) || !Number.isFinite(normal) || normal <= unit) return 0
  return Math.round((1 - unit / normal) * 100)
}
