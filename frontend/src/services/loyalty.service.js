import api from './api.js'

export async function getLoyaltyAccount() {
  const res = await api.get('/loyalty/me')
  return res.data.data
}

export async function getLoyaltyRewards() {
  const res = await api.get('/loyalty/me/rewards')
  return res.data.data ?? []
}

/* Paliers actifs — route publique, utilisable sans être connecté.
   Permet à la boutique de n'annoncer le programme que s'il existe vraiment. */
export async function getLoyaltyTiers() {
  const res = await api.get('/loyalty/tiers')
  return res.data.data ?? []
}
