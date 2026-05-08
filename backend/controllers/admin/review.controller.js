const reviewRepository = require('../../repositories/review.repository');
const { AppError } = require('../../middlewares/errorHandler');

const getAll = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const approved = req.query.approved !== undefined ? req.query.approved === 'true' : null;
    const { rows, total } = await reviewRepository.findAll({ page, limit, approved });
    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

const approve = async (req, res, next) => {
  try {
    await reviewRepository.approve(parseInt(req.params.id));
    res.json({ success: true, message: 'Avis approuvé.' });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    const deleted = await reviewRepository.remove(parseInt(req.params.id));
    if (!deleted) return next(new AppError('Avis introuvable.', 404));
    res.json({ success: true, message: 'Avis supprimé.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll, approve, remove };
