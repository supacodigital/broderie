const supplierRepository = require('../../repositories/supplier.repository');
const { AppError }        = require('../../middlewares/errorHandler');

// Valide la cohérence du délai "sur commande" (min/max en semaines, max >= min)
const validateDelay = (madeToOrderDelayMinWeeks, madeToOrderDelayMaxWeeks) => {
  const min = madeToOrderDelayMinWeeks;
  const max = madeToOrderDelayMaxWeeks;
  if (min == null && max == null) return null;
  if (min == null || max == null) return 'Le délai minimum et maximum doivent être renseignés ensemble.';
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < 1 || max > 255) {
    return 'Le délai doit être un nombre entier de semaines valide.';
  }
  if (max < min) return 'Le délai maximum doit être supérieur ou égal au délai minimum.';
  return null;
};

const getAll = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const search = req.query.q || '';
    const { rows, total } = await supplierRepository.findAll({ page, limit, search });
    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const supplier = await supplierRepository.findById(parseInt(req.params.id));
    if (!supplier) return next(new AppError('Fournisseur introuvable.', 404));
    res.json({ success: true, data: supplier });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const { name, contactName, email, phone, address, notes, madeToOrderDelayMinWeeks, madeToOrderDelayMaxWeeks } = req.body;
    if (!name) return next(new AppError('Le nom du fournisseur est obligatoire.', 400));
    const delayError = validateDelay(madeToOrderDelayMinWeeks, madeToOrderDelayMaxWeeks);
    if (delayError) return next(new AppError(delayError, 400));
    const id = await supplierRepository.create({ name, contactName, email, phone, address, notes, madeToOrderDelayMinWeeks, madeToOrderDelayMaxWeeks });
    const supplier = await supplierRepository.findById(id);
    res.status(201).json({ success: true, data: supplier });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await supplierRepository.findById(id);
    if (!existing) return next(new AppError('Fournisseur introuvable.', 404));
    const { name, contactName, email, phone, address, notes, madeToOrderDelayMinWeeks, madeToOrderDelayMaxWeeks, isActive } = req.body;
    const delayError = validateDelay(madeToOrderDelayMinWeeks, madeToOrderDelayMaxWeeks);
    if (delayError) return next(new AppError(delayError, 400));
    const supplier = await supplierRepository.update(id, { name, contactName, email, phone, address, notes, madeToOrderDelayMinWeeks, madeToOrderDelayMaxWeeks, isActive });
    res.json({ success: true, data: supplier });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await supplierRepository.remove(id);
    if (!deleted) return next(new AppError('Fournisseur introuvable.', 404));
    res.json({ success: true, message: 'Fournisseur supprimé.' });
  } catch (error) {
    next(error);
  }
};

const getDetails = async (req, res, next) => {
  try {
    const supplier = await supplierRepository.findByIdWithProducts(parseInt(req.params.id));
    if (!supplier) return next(new AppError('Fournisseur introuvable.', 404));
    res.json({ success: true, data: supplier });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll, getById, create, update, remove, getDetails };
