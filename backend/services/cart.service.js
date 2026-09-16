const cartRepository = require('../repositories/cart.repository');
const productRepository = require('../repositories/product.repository');
const { AppError } = require('../middlewares/errorHandler');
const lengthUtils = require('../utils/length.utils');

/* Message de stock insuffisant, dans l'unité que la cliente comprend :
   des centimètres pour une bande, des pièces pour le reste. */
const stockMessage = (product, available) =>
  lengthUtils.isSoldByLength(product)
    ? `Stock insuffisant. Disponible : ${available * lengthUtils.stepCm(product)} cm`
    : `Stock insuffisant. Disponible : ${available}`;
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

const getCart = async ({ userId, sessionId, locale = 'fr' }) => {
  const cart = await cartRepository.findCart({ userId, sessionId });
  if (!cart) return { items: [], total: 0 };

  const items = await cartRepository.findCartItems(cart.id, locale);

  // Filtrer les articles dont le produit a été supprimé ou désactivé
  const activeItems = items.filter((item) => item.is_active && !item.deleted_at);

  const total = roundCHF(
    activeItems.reduce((sum, item) => sum + item.price_snapshot * item.quantity, 0)
  );

  return { cartId: cart.id, items: activeItems, total };
};

const addItem = async ({ userId, sessionId, productId, variantId, quantity, locale = 'fr' }) => {
  // Validation de la quantité
  const qty = parseInt(quantity);
  if (!qty || qty < 1 || qty > 999) throw new AppError('Quantité invalide (entre 1 et 999).', 400);

  // Vérification stock et existence produit
  const product = await productRepository.findById(productId, 'fr');
  if (!product) throw new AppError('Produit introuvable.', 404);

  /* Longueur minimale pour les articles vendus à la coupe (50 cm par défaut).
     Contrôlé côté serveur : le champ de la boutique borne déjà la saisie, mais
     un appel direct à l'API ne doit pas permettre de commander 10 cm. */
  if (lengthUtils.isSoldByLength(product)) {
    const check = lengthUtils.validateLengthQuantity(product, qty);
    if (!check.valid) throw new AppError(check.message, 400);
  }
  // Produit sur commande : aucune limite de stock (fabriqué à la demande, délai 3 à 4 semaines)
  const isMadeToOrder = !!product.is_made_to_order;
  /* Stock comparé dans l'unité de `quantity` : pour un article vendu à la coupe,
     `stock` compte des mètres et `quantity` des tronçons de 10 cm. Voir
     utils/length.utils.js — sans cette conversion, une bande avec 1 m en stock
     refusait une commande de 50 cm. */
  const available = lengthUtils.availableQuantity(product);
  if (!isMadeToOrder && available < qty) {
    throw new AppError(stockMessage(product, available), 400);
  }

  const cart = await resolveCart({ userId, sessionId });

  // Si l'article existe déjà, incrémenter la quantité
  const existingItem = await cartRepository.findCartItem(cart.id, productId, variantId);
  if (existingItem) {
    const newQty = existingItem.quantity + qty;
    if (!isMadeToOrder && available < newQty) {
      throw new AppError(stockMessage(product, available), 400);
    }
    await cartRepository.updateItemQuantity(existingItem.id, newQty);
    return getCart({ userId, sessionId, locale });
  }

  /* Prix figé au moment de l'ajout au panier.
     Article vendu à la coupe (trames, bandes à broder) : `quantity` compte des
     tronçons de 10 cm et non des pièces, donc le prix unitaire est celui du
     tronçon, dérivé du prix au mètre. Voir utils/length.utils.js. */
  let priceSnapshot = lengthUtils.isSoldByLength(product)
    ? lengthUtils.pricePerStep(product)
    : product.price_chf;
  if (variantId && product.variants) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant) priceSnapshot = roundCHF(parseFloat(priceSnapshot) + variant.price_modifier);
  }

  await cartRepository.addItem({
    cartId: cart.id,
    productId,
    variantId,
    quantity: qty,
    priceSnapshot,
    taxRateSnapshot: product.tax_rate,
  });

  return getCart({ userId, sessionId, locale });
};

const updateItem = async ({ userId, sessionId, itemId, quantity, locale = 'fr' }) => {
  const qty = parseInt(quantity);
  if (!qty || qty < 1 || qty > 999) throw new AppError('Quantité invalide (entre 1 et 999).', 400);

  const cart = await cartRepository.findCart({ userId, sessionId });
  if (!cart) throw new AppError('Panier introuvable.', 404);

  const item = await cartRepository.findCartItemById(itemId, cart.id);
  if (!item) throw new AppError('Article introuvable dans le panier.', 404);

  // Vérification stock — ignorée pour les produits sur commande
  const product = await productRepository.findById(item.product_id, 'fr');
  if (!product) throw new AppError('Produit introuvable.', 404);

  /* Même garde qu'à l'ajout : sans elle, une cliente pouvait ajouter 50 cm
     puis ramener la ligne à 10 cm depuis le panier. */
  if (lengthUtils.isSoldByLength(product)) {
    const check = lengthUtils.validateLengthQuantity(product, qty);
    if (!check.valid) throw new AppError(check.message, 400);
  }

  const availableForUpdate = lengthUtils.availableQuantity(product);
  if (!product.is_made_to_order && availableForUpdate < qty) {
    throw new AppError(stockMessage(product, availableForUpdate), 400);
  }

  await cartRepository.updateItemQuantity(itemId, qty);
  return getCart({ userId, sessionId, locale });
};

const removeItem = async ({ userId, sessionId, itemId, locale = 'fr' }) => {
  const cart = await cartRepository.findCart({ userId, sessionId });
  if (!cart) throw new AppError('Panier introuvable.', 404);

  const item = await cartRepository.findCartItemById(itemId, cart.id);
  if (!item) throw new AppError('Article introuvable dans le panier.', 404);

  await cartRepository.removeItem(itemId);
  return getCart({ userId, sessionId, locale });
};

module.exports = { getCart, addItem, updateItem, removeItem };
