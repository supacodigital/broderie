import api from './api.js'

/**
 * Retourne le tarif de livraison CHF pour un montant d'articles donné (ADM-10) —
 * sous-total TTC avant code promo, le même que celui de la commande.
 * Utilisé au panier et au checkout pour afficher les frais avant confirmation.
 */
export async function getShippingRate(amountChf = 0) {
  const res = await api.get('/shipping/rates', { params: { amount: amountChf } })
  return res.data.data
}
