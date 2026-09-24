/* Arrondi au 0.05 CHF le plus proche — standard suisse */
export const roundCHF = (amount) => Math.round(amount * 20) / 20

/* Montant au centime, SANS l'arrondi au 0.05 — pour la TVA, qui se déclare au
   centime (ADM-14) : arrondie comme un montant à payer, elle affichait 1.60
   quand la facture en imprime 1.61. */
export const formatCents = (amount) => {
  const cents = Math.round((Number(amount) || 0) * 100) / 100
  return 'CHF ' + cents.toLocaleString('fr-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/* Formatage CHF avec apostrophe suisse et 2 décimales : 1'289.90 */
export const formatCHF = (amount) => {
  const rounded = roundCHF(Number(amount) || 0)
  return 'CHF ' + rounded.toLocaleString('fr-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
