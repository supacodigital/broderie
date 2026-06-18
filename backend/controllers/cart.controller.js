const { z }          = require('zod');
const cartService    = require('../services/cart.service');
const cartRepository = require('../repositories/cart.repository');
const { v4: uuidv4 } = require('uuid');
const env            = require('../config/env');
const { localeFromRequest } = require('../utils/locale.utils');

const addItemSchema = z.object({
  product_id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/).transform(Number)]).optional(),
  productId:  z.union([z.number().int().positive(), z.string().regex(/^\d+$/).transform(Number)]).optional(),
  variant_id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/).transform(Number)]).optional().nullable(),
  variantId:  z.union([z.number().int().positive(), z.string().regex(/^\d+$/).transform(Number)]).optional().nullable(),
  quantity:   z.number().int().min(1).max(999).optional().default(1),
}).refine(d => d.product_id != null || d.productId != null, { message: 'product_id requis.' });

const updateItemSchema = z.object({
  quantity: z.number().int().min(1).max(999),
});

const CART_COOKIE_OPTS = {
  httpOnly: true,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  sameSite: env.nodeEnv === 'production' ? 'Strict' : 'Lax',
  secure:   env.nodeEnv === 'production',
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
    const cart = await cartService.getCart({ userId, sessionId, locale: localeFromRequest(req) });
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
};

const addItem = async (req, res, next) => {
  try {
    const parsed = addItemSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map(e => ({ field: e.path[0], message: e.message }));
      return res.status(400).json({ success: false, message: 'Données invalides.', errors });
    }
    const { userId, sessionId } = await resolveIdentifiers(req, res);
    const productId = parsed.data.product_id ?? parsed.data.productId;
    const variantId = parsed.data.variant_id ?? parsed.data.variantId ?? null;
    const { quantity } = parsed.data;
    const cart = await cartService.addItem({ userId, sessionId, productId, variantId, quantity, locale: localeFromRequest(req) });
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
};

const updateItem = async (req, res, next) => {
  try {
    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Quantité invalide (entier entre 1 et 999).' });
    }
    const itemId = parseInt(req.params.id, 10);
    if (!itemId || itemId < 1) {
      return res.status(400).json({ success: false, message: 'ID article invalide.' });
    }
    const { userId, sessionId } = await resolveIdentifiers(req, res);
    const cart = await cartService.updateItem({ userId, sessionId, itemId, quantity: parsed.data.quantity, locale: localeFromRequest(req) });
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
};

const removeItem = async (req, res, next) => {
  try {
    const { userId, sessionId } = await resolveIdentifiers(req, res);
    const itemId = parseInt(req.params.id);
    const cart = await cartService.removeItem({ userId, sessionId, itemId, locale: localeFromRequest(req) });
    res.json({ success: true, data: cart });
  } catch (error) {
    next(error);
  }
};

module.exports = { getCart, addItem, updateItem, removeItem };
