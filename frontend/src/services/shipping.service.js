import api from './api.js'

/**
 * Retourne le tarif de livraison CHF pour un poids total donné (en kg).
 * Utilisé dans le checkout pour afficher les frais avant confirmation.
 */
export async function getShippingRate(weightKg = 0) {
  const res = await api.get('/shipping/rates', { params: { weight: weightKg } })
  return res.data.data
}
