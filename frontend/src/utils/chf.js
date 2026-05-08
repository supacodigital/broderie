/* Arrondi au 0.05 CHF le plus proche — règle légale suisse */
export function roundCHF(amount) {
  return Math.round(parseFloat(amount) * 20) / 20
}
