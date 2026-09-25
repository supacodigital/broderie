/* Numéro de commande affiché = numéro de facture (« 2026-09/22 »), demande de
   la boutique (25.09). Sans facture (paiement en ligne pas encore accepté), la
   commande garde son identifiant interne. */
export const orderNumber = (order) => order?.invoice_number || `#${order?.id}`
