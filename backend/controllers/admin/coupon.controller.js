const couponRepository = require('../../repositories/coupon.repository');
const { AppError } = require('../../middlewares/errorHandler');

const getAll = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 100);
    const { rows, total } = await couponRepository.findAll({ page, limit });
    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const { code, type, value, minOrderChf, usageLimit, expiresAt, isActive } = req.body;
    if (!code) return next(new AppError('Le code est obligatoire.', 400));
    if (!['fixed', 'percent'].includes(type)) return next(new AppError('Type invalide. Valeurs : fixed, percent.', 400));
    if (!value || value <= 0) return next(new AppError('La valeur doit être positive.', 400));

    const existing = await couponRepository.findByCode(code);
    if (existing) return next(new AppError('Ce code est déjà utilisé.', 409));

    const id = await couponRepository.create({ code, type, value, minOrderChf, usageLimit, expiresAt, isActive });
    const coupon = await couponRepository.findById(id);
    res.status(201).json({ success: true, data: coupon });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { code, type, value, minOrderChf, usageLimit, expiresAt, isActive } = req.body;

    if (!code) return next(new AppError('Le code est obligatoire.', 400));
    if (!['fixed', 'percent'].includes(type)) return next(new AppError('Type invalide.', 400));

    const existing = await couponRepository.findById(id);
    if (!existing) return next(new AppError('Coupon introuvable.', 404));

    const codeTaken = await couponRepository.findByCode(code, id);
    if (codeTaken) return next(new AppError('Ce code est déjà utilisé.', 409));

    await couponRepository.update(id, { code, type, value, minOrderChf, usageLimit, expiresAt, isActive });
    const coupon = await couponRepository.findById(id);
    res.json({ success: true, data: coupon });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    const deleted = await couponRepository.remove(parseInt(req.params.id));
    if (!deleted) return next(new AppError('Coupon introuvable.', 404));
    res.json({ success: true, message: 'Coupon supprimé.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll, create, update, remove };
