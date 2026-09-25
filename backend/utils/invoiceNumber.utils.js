/* Numéro de facture — ticket ADM-18.

   Format demandé par la cliente : « l'année et le mois plus un numéro, EX
   2026-09/01 ». Le compteur repart à 01 chaque mois (2026-10/01, 2026-10/02…
   puis 2026-11/01). Les factures émises avant ce format gardent leur numéro
   annuel (« 2026-000013 ») : un numéro de facture ne se réécrit jamais.

   Le mois est celui de Suisse : le serveur tourne en UTC, et une facture émise
   le 1er octobre à 00h30 à Vucherens appartient à octobre, pas à septembre. */

// Année et mois civils en Suisse, pour une date donnée
const zurichYearMonth = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit' })
    .formatToParts(date);
  const pick = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: pick('year'), month: pick('month') };
};

// Période du compteur : « 2026-09 »
const invoicePeriod = ({ year, month }) => `${year}-${String(month).padStart(2, '0')}`;

// « 2026-09/01 » — numéro sur deux chiffres au moins, sans limite au-delà
const formatInvoiceNumber = ({ year, month }, seq) =>
  `${invoicePeriod({ year, month })}/${String(seq).padStart(2, '0')}`;

/* Lit un numéro déjà émis : mensuel (« 2026-09/01 ») ou annuel d'avant ADM-18
   (« 2026-000013 », mois inconnu). null si le format n'est pas reconnu. */
const parseInvoiceNumber = (value) => {
  const s = String(value ?? '');
  let m = s.match(/^(\d{4})-(\d{2})\/(\d+)$/);
  if (m) return { year: Number(m[1]), month: Number(m[2]), seq: Number(m[3]) };
  m = s.match(/^(\d{4})-(\d+)$/);
  if (m) return { year: Number(m[1]), month: null, seq: Number(m[2]) };
  return null;
};

module.exports = { zurichYearMonth, invoicePeriod, formatInvoiceNumber, parseInvoiceNumber };
