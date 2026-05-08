import api from './api.js'

export async function fetchCart() {
  const res = await api.get('/cart')
  return res.data
}

export async function addCartItem(productId, variantId, quantity) {
  const res = await api.post('/cart/items', { product_id: productId, variant_id: variantId, quantity })
  return res.data
}

export async function updateCartItem(itemId, quantity) {
  const res = await api.put(`/cart/items/${itemId}`, { quantity })
  return res.data
}

export async function removeCartItem(itemId) {
  const res = await api.delete(`/cart/items/${itemId}`)
  return res.data
}
