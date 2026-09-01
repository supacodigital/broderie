const categoryAdminService = require('../../services/category.admin.service');

const getAll = async (req, res, next) => {
  try {
    res.json({ success: true, data: await categoryAdminService.listAll() });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    res.json({ success: true, data: await categoryAdminService.getById(parseInt(req.params.id)) });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const category = await categoryAdminService.create(req.body);
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const category = await categoryAdminService.update(parseInt(req.params.id), req.body);
    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await categoryAdminService.remove(parseInt(req.params.id));
    res.json({ success: true, message: 'Catégorie supprimée.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll, getById, create, update, remove };
