const loyaltyRepository = require('../../repositories/loyalty.repository');
const { AppError } = require('../../middlewares/errorHandler');
const { tierShapeSchema } = require('../../validators/loyalty.validator');

// Valide la forme d'un palier — même format d'erreurs que les autres modules admin.
const validateTier = (body) => {
  const parsed = tierShapeSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
    throw new AppError('Données invalides.', 400, errors);
  }
  return parsed.data;
};

const getTiers = async (req, res, next) => {
  try {
    const tiers = await loyaltyRepository.findAllTiers();
    res.json({ success: true, data: tiers });
  } catch (error) {
    next(error);
  }
};

const createTier = async (req, res, next) => {
  try {
    const { name, minSpendChf, rewardType, rewardValue, rewardValidityDays, isActive, sortOrder } = validateTier(req.body);
    const id = await loyaltyRepository.createTier({ name, minSpendChf, rewardType, rewardValue, rewardValidityDays, isActive, sortOrder });
    const tiers = await loyaltyRepository.findAllTiers();
    const created = tiers.find((t) => t.id === id);
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
};

const updateTier = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { name, minSpendChf, rewardType, rewardValue, rewardValidityDays, isActive, sortOrder } = validateTier(req.body);
    await loyaltyRepository.updateTier(id, { name, minSpendChf, rewardType, rewardValue, rewardValidityDays, isActive, sortOrder });
    const tiers = await loyaltyRepository.findAllTiers();
    const updated = tiers.find((t) => t.id === id);
    if (!updated) return next(new AppError('Palier introuvable.', 404));
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

const deleteTier = async (req, res, next) => {
  try {
    const deleted = await loyaltyRepository.deleteTier(parseInt(req.params.id));
    if (!deleted) return next(new AppError('Palier introuvable.', 404));
    res.json({ success: true, message: 'Palier supprimé.' });
  } catch (error) {
    next(error);
  }
};

const getAccounts = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const search = req.query.q || '';
    const { rows, total } = await loyaltyRepository.findAllAccounts({ page, limit, search });
    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

const getKpis = async (req, res, next) => {
  try {
    const kpis = await loyaltyRepository.getGlobalKpis();
    res.json({ success: true, data: kpis });
  } catch (error) {
    next(error);
  }
};

const getRewards = async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const status = req.query.status || '';
    const { rows, total } = await loyaltyRepository.findAllRewards({ page, limit, status });
    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getTiers, createTier, updateTier, deleteTier, getAccounts, getKpis, getRewards };
