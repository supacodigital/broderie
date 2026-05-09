const cartService  = require('../services/cart.service');
const cartRepository = require('../repositories/cart.repository');
const { v4: uuidv4 } = require('uuid');

const CART_COOKIE_OPTS = {
  httpOnly: true,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  sameSite: process.env.NODE_ENV === 'production' ? 'Strict' : 'Lax',
  secure: process.env.NODE_ENV === 'production',
};

// Résout les identifiants et fusionne le panier anonyme si l'utilisateur vient de se connecter
const resolveIdentifiers = async (req, res) => {
  const userId    = req.user?.id || null;
  const sessionId = req.cookies?.cartSession || null;

  if (userId && sessionId) {
    // Fusionner le panier anonyme dans le compte puis supprimer le cookie
    await cartRepository.mergeCart(sessionId, userId);
    res.clearCookie('cartSession');
    return { userId, sessionId: null };
  }

  if (userId) {
    return { userId, sessionId: null };
  }

  // Utilisateur anonyme — créer le cookie session si absent
  if (!sessionId) {
    const newSessionId = uuidv4();
    res.cookie('cartSession', newSessionId, CART_COOKIE_OPTS);
    return { userId: null, sessionId: newSessionId };
  }

  return { userId: null, sessionId };
};

const getCart = async (req, res, next) => {
  try {
    const { userId, sessionId } = await resolveIdentifiers(req, res);
    const cart = await cartService.getCart({ userId, sessionId });
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
};

const addItem = async (req, res, next) => {
  try {
    const { userId, sessionId } = await resolveIdentifiers(req, res);
    const { product_id, productId: pid, variant_id, variantId: vid, quantity = 1 } = req.body;
    const productId = product_id ?? pid;
    const variantId = variant_id ?? vid ?? null;
    const cart = await cartService.addItem({ userId, sessionId, productId, variantId, quantity });
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
};

const updateItem = async (req, res, next) => {
  try {
    const { userId, sessionId } = await resolveIdentifiers(req, res);
    const itemId = parseInt(req.params.id);
    const { quantity } = req.body;
    const cart = await cartService.updateItem({ userId, sessionId, itemId, quantity });
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
};

const removeItem = async (req, res, next) => {
  try {
    const { userId, sessionId } = await resolveIdentifiers(req, res);
    const itemId = parseInt(req.params.id);
    const cart = await cartService.removeItem({ userId, sessionId, itemId });
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
};

module.exports = { getCart, addItem, updateItem, removeItem };
