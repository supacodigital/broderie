const tagAdminService = require('../../services/tag.admin.service');

const getAll = async (req, res, next) => {
  try {
    res.json({ success: true, data: await tagAdminService.listAll() });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    res.json({ success: true, data: await tagAdminService.getById(parseInt(req.params.id)) });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const tag = await tagAdminService.create(req.body);
    res.status(201).json({ success: true, data: tag });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const tag = await tagAdminService.update(parseInt(req.params.id), req.body);
    res.json({ success: true, data: tag });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await tagAdminService.remove(parseInt(req.params.id));
    res.json({ success: true, message: 'Tag supprimé.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll, getById, create, update, remove };
