const supplierRepository = require('../../repositories/supplier.repository');
const { AppError }        = require('../../middlewares/errorHandler');

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
    const { name, contactName, email, phone, address, notes } = req.body;
    if (!name) return next(new AppError('Le nom du fournisseur est obligatoire.', 400));
    const id = await supplierRepository.create({ name, contactName, email, phone, address, notes });
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
    const { name, contactName, email, phone, address, notes, isActive } = req.body;
    const supplier = await supplierRepository.update(id, { name, contactName, email, phone, address, notes, isActive });
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
