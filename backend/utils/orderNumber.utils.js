/* Numéro de commande affiché — c'est le numéro de facture (« 2026-09/22 »),
   à la demande de la boutique (25.09) : une seule référence pour la cliente,
   sur le site, les e-mails et la facture. Une commande qui n'a pas encore de
   facture (paiement en ligne pas encore accepté) garde son identifiant
   interne. */
const orderNumber = (order) => order?.invoice_number || `#${order?.id}`;

// Pour un nom de fichier : « 2026-09/22 » → « 2026-09-22 »
const orderFileSlug = (order) => (order?.invoice_number
  ? String(order.invoice_number).replace(/[^\w-]+/g, '-')
  : String(order?.id ?? '').padStart(6, '0'));

module.exports = { orderNumber, orderFileSlug };
