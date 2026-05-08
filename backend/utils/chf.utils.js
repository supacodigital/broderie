// Arrondi au 0.05 CHF le plus proche — obligation légale suisse
const roundCHF = (amount) => Math.round(amount * 20) / 20;

// Formatage pour affichage (ex: "12.50")
const formatCHF = (amount) => roundCHF(amount).toFixed(2);

module.exports = { roundCHF, formatCHF };
