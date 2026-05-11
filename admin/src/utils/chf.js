/* Arrondi au 0.05 CHF le plus proche — standard suisse */
export const roundCHF = (amount) => Math.round(amount * 20) / 20

/* Formatage CHF avec apostrophe suisse et 2 décimales : 1'289.90 */
export const formatCHF = (amount) => {
  const rounded = roundCHF(Number(amount) || 0)
  return 'CHF ' + rounded.toLocaleString('fr-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
