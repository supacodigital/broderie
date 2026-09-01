const productAdminService = require('../../services/product.admin.service');
const { normalizeLocale }  = require('../../utils/locale.utils');

const getAll = async (req, res, next) => {
  try {
    const { data, pagination } = await productAdminService.list(req.query);
    res.json({ success: true, data, pagination });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const product = await productAdminService.getById(parseInt(req.params.id), normalizeLocale(req.query.locale));
    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const product = await productAdminService.create(req.body);
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const product = await productAdminService.update(parseInt(req.params.id, 10), req.body);
    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await productAdminService.remove(parseInt(req.params.id));
    res.json({ success: true, message: 'Produit supprimé.' });
  } catch (error) {
    next(error);
  }
};

const uploadImage = async (req, res, next) => {
  try {
    const data = await productAdminService.addImage(parseInt(req.params.id), req.file, {
      isPrimary: req.body.isPrimary === 'true',
      alt:       req.body.alt || null,
      sortOrder: parseInt(req.body.sortOrder) || 0,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const removeImage = async (req, res, next) => {
  try {
    await productAdminService.removeImage(parseInt(req.params.imageId), parseInt(req.params.id));
    res.json({ success: true, message: 'Image supprimée.' });
  } catch (error) {
    next(error);
  }
};

const setPrimaryImage = async (req, res, next) => {
  try {
    await productAdminService.setPrimaryImage(parseInt(req.params.imageId), parseInt(req.params.id));
    res.json({ success: true, message: 'Image principale mise à jour.' });
  } catch (error) {
    next(error);
  }
};

const updateFeaturedOrder = async (req, res, next) => {
  try {
    await productAdminService.updateFeaturedOrder(req.body);
    res.json({ success: true, message: 'Ordre de la vitrine mis à jour.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAll, getById, create, update, remove,
  uploadImage, removeImage, setPrimaryImage, updateFeaturedOrder,
};
