import api from './api.js'

export async function getWishlist(locale = 'fr') {
  const res = await api.get('/users/me/wishlist', { params: { locale } })
  return res.data
}

export async function addToWishlist(productId) {
  const res = await api.post(`/users/me/wishlist/${productId}`)
  return res.data
}

export async function removeFromWishlist(productId) {
  const res = await api.delete(`/users/me/wishlist/${productId}`)
  return res.data
}
