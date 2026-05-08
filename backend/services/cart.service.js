const cartRepository = require('../repositories/cart.repository');
const productRepository = require('../repositories/product.repository');
const { AppError } = require('../middlewares/errorHandler');
const { roundCHF } = require('../utils/chf.utils');

// Résout l'identifiant du panier — user connecté ou session anonyme
const resolveCart = async ({ userId, sessionId }) => {
  let cart = await cartRepository.findCart({ userId, sessionId });
  if (!cart) {
    const cartId = await cartRepository.createCart({ userId, sessionId });
    cart = { id: cartId };
  }
  return cart;
};

const getCart = async ({ userId, sessionId }) => {
  const cart = await cartRepository.findCart({ userId, sessionId });
  if (!cart) return { items: [], total: 0 };

  const items = await cartRepository.findCartItems(cart.id);

  // Filtrer les articles dont le produit a été supprimé ou désactivé
  const activeItems = items.filter((item) => item.is_active && !item.deleted_at);

  const total = roundCHF(
    activeItems.reduce((sum, item) => sum + item.price_snapshot * item.quantity, 0)
  );

  return { cartId: cart.id, items: activeItems, total };
};

const addItem = async ({ userId, sessionId, productId, variantId, quantity }) => {
  // Validation de la quantité
  const qty = parseInt(quantity);
  if (!qty || qty < 1 || qty > 999) throw new AppError('Quantité invalide (entre 1 et 999).', 400);

  // Vérification stock et existence produit
  const product = await productRepository.findById(productId, 'fr');
  if (!product) throw new AppError('Produit introuvable.', 404);
  if (product.stock < qty) {
    throw new AppError(`Stock insuffisant. Disponible : ${product.stock}`, 400);
  }

  const cart = await resolveCart({ userId, sessionId });

  // Si l'article existe déjà, incrémenter la quantité
  const existingItem = await cartRepository.findCartItem(cart.id, productId, variantId);
  if (existingItem) {
    const newQty = existingItem.quantity + qty;
    if (product.stock < newQty) {
      throw new AppError(`Stock insuffisant. Disponible : ${product.stock}`, 400);
    }
    await cartRepository.updateItemQuantity(existingItem.id, newQty);
    return getCart({ userId, sessionId });
  }

  // Prix figé au moment de l'ajout au panier
  let priceSnapshot = product.price_chf;
  if (variantId && product.variants) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant) priceSnapshot = roundCHF(parseFloat(product.price_chf) + variant.price_modifier);
  }

  await cartRepository.addItem({
    cartId: cart.id,
    productId,
    variantId,
    quantity: qty,
    priceSnapshot,
    taxRateSnapshot: product.tax_rate,
  });

  return getCart({ userId, sessionId });
};

const updateItem = async ({ userId, sessionId, itemId, quantity }) => {
  const qty = parseInt(quantity);
  if (!qty || qty < 1 || qty > 999) throw new AppError('Quantité invalide (entre 1 et 999).', 400);

  const cart = await cartRepository.findCart({ userId, sessionId });
  if (!cart) throw new AppError('Panier introuvable.', 404);

  const item = await cartRepository.findCartItemById(itemId, cart.id);
  if (!item) throw new AppError('Article introuvable dans le panier.', 404);

  // Vérification stock
  const product = await productRepository.findById(item.product_id, 'fr');
  if (!product || product.stock < qty) {
    throw new AppError(`Stock insuffisant. Disponible : ${product?.stock ?? 0}`, 400);
  }

  await cartRepository.updateItemQuantity(itemId, qty);
  return getCart({ userId, sessionId });
};

const removeItem = async ({ userId, sessionId, itemId }) => {
  const cart = await cartRepository.findCart({ userId, sessionId });
  if (!cart) throw new AppError('Panier introuvable.', 404);

  const item = await cartRepository.findCartItemById(itemId, cart.id);
  if (!item) throw new AppError('Article introuvable dans le panier.', 404);

  await cartRepository.removeItem(itemId);
  return getCart({ userId, sessionId });
};

module.exports = { getCart, addItem, updateItem, removeItem };
