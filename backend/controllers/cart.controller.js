const cartService = require('../services/cart.service');
const { v4: uuidv4 } = require('uuid');

// Résout les identifiants — user connecté ou session cookie anonyme
const resolveIdentifiers = (req, res) => {
  const userId = req.user?.id || null;
  let sessionId = null;

  if (!userId) {
    sessionId = req.cookies?.cartSession;
    if (!sessionId) {
      sessionId = uuidv4();
      res.cookie('cartSession', sessionId, {
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 jours
        sameSite: 'Strict',
        secure: process.env.NODE_ENV === 'production',
      });
    }
  }

  return { userId, sessionId };
};

const getCart = async (req, res, next) => {
  try {
    const { userId, sessionId } = resolveIdentifiers(req, res);
    const cart = await cartService.getCart({ userId, sessionId });
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
};

const addItem = async (req, res, next) => {
  try {
    const { userId, sessionId } = resolveIdentifiers(req, res);
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
    const { userId, sessionId } = resolveIdentifiers(req, res);
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
    const { userId, sessionId } = resolveIdentifiers(req, res);
    const itemId = parseInt(req.params.id);
    const cart = await cartService.removeItem({ userId, sessionId, itemId });
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
};

module.exports = { getCart, addItem, updateItem, removeItem };
