const { z } = require('zod');
const reviewRepository = require('../repositories/review.repository');
const { AppError } = require('../middlewares/errorHandler');
const { mapDbError } = require('../utils/db.utils');

// Validation de l'avis soumis — note entière 1..5, textes bornés
// (la limite body = 1000 correspond au compteur affiché côté front)
const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title:  z.string().trim().min(1).max(120).optional(),
  body:   z.string().trim().min(1).max(1000).optional(),
});

// Avis approuvés d'un produit (public)
const getByProduct = async (req, res, next) => {
  try {
    const productId = parseInt(req.params.id);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const { rows, total } = await reviewRepository.findApprovedByProduct(productId, { page, limit });
    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

// Soumettre un avis (client authentifié) — réservé aux acheteurs du produit
const create = async (req, res, next) => {
  try {
    const productId = parseInt(req.params.id);

    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
      return res.status(400).json({ success: false, message: 'Avis invalide.', errors });
    }
    const { rating, title, body } = parsed.data;

    // On ne peut noter qu'un produit qu'on a effectivement acheté
    if (!(await reviewRepository.hasPurchased(req.user.id, productId))) {
      return next(new AppError('Vous devez avoir acheté ce produit pour laisser un avis.', 403));
    }

    await reviewRepository.create({ userId: req.user.id, productId, rating, title, body });
    res.status(201).json({ success: true, message: 'Avis soumis. Il sera publié après modération.' });
  } catch (error) {
    // Doublon (user_id, product_id) → 409 "Vous avez déjà laissé un avis pour ce produit."
    next(mapDbError(error));
  }
};

// Avis approuvés récents (public — page d'accueil)
const getApproved = async (req, res, next) => {
  try {
    const limit  = Math.min(10, parseInt(req.query.limit) || 3);
    const rating = req.query.rating ? parseInt(req.query.rating) : null;
    const rows   = await reviewRepository.findApproved({ limit, rating });
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

module.exports = { getByProduct, getApproved, create };
