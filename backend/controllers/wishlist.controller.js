const wishlistRepository = require('../repositories/wishlist.repository');
const productRepository = require('../repositories/product.repository');
const { AppError } = require('../middlewares/errorHandler');
const { normalizeLocale } = require('../utils/locale.utils');

const getWishlist = async (req, res, next) => {
  try {
    const locale = normalizeLocale(req.query.locale || req.user?.locale);
    const items = await wishlistRepository.findByUser(req.user.id, locale);
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
};

const addToWishlist = async (req, res, next) => {
  try {
    const productId = parseInt(req.params.productId);

    const product = await productRepository.findById(productId, normalizeLocale(req.query.locale || req.user?.locale));
    if (!product) return next(new AppError('Produit introuvable.', 404));

    await wishlistRepository.add(req.user.id, productId);
    res.status(201).json({ success: true, message: 'Produit ajouté à la liste de souhaits.' });
  } catch (error) {
    next(error);
  }
};

const removeFromWishlist = async (req, res, next) => {
  try {
    const productId = parseInt(req.params.productId);
    const removed = await wishlistRepository.remove(req.user.id, productId);
    if (!removed) return next(new AppError('Produit introuvable dans la liste de souhaits.', 404));
    res.json({ success: true, message: 'Produit retiré de la liste de souhaits.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getWishlist, addToWishlist, removeFromWishlist };
