/* Arrondi au 0.05 CHF le plus proche — standard suisse */
export const roundCHF = (amount) => Math.round(amount * 20) / 20
