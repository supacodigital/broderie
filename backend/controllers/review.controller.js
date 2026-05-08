const reviewRepository = require('../repositories/review.repository');
const { AppError } = require('../middlewares/errorHandler');

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

// Soumettre un avis (client authentifié)
const create = async (req, res, next) => {
  try {
    const productId = parseInt(req.params.id);
    const { rating, title, body } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return next(new AppError('La note doit être comprise entre 1 et 5.', 400));
    }

    await reviewRepository.create({ userId: req.user.id, productId, rating, title, body });
    res.status(201).json({ success: true, message: 'Avis soumis. Il sera publié après modération.' });
  } catch (error) {
    next(error);
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
