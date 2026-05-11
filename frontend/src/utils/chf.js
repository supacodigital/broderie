/* Arrondi au 0.05 CHF le plus proche — règle légale suisse */
export function roundCHF(amount) {
  return Math.round(parseFloat(amount) * 20) / 20
}

/* Formatage avec apostrophe suisse et deux décimales — ex: CHF 1'289.90 */
export function formatCHF(amount) {
  const rounded = roundCHF(amount)
  return 'CHF ' + rounded.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
