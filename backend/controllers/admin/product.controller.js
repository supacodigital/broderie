const productAdminService = require('../../services/product.admin.service');
const { normalizeLocale }  = require('../../utils/locale.utils');

const getAll = async (req, res, next) => {
  try {
    const { data, pagination, isFuzzy } = await productAdminService.list(req.query);
    /* `isFuzzy` signale des résultats approchés (repli anti-faute de frappe) :
       sans lui, l'administration laisserait croire à une correspondance exacte. */
    res.json({ success: true, data, pagination, ...(isFuzzy && { isFuzzy: true }) });
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
    const product = await productAdminService.create(req.body, { changedBy: req.user?.id ?? null });
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const product = await productAdminService.update(parseInt(req.params.id, 10), req.body, { changedBy: req.user?.id ?? null });
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

const setFeatured = async (req, res, next) => {
  try {
    const data = await productAdminService.setFeatured(parseInt(req.params.id, 10), req.body);
    res.json({ success: true, data });
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

/* Historique des prix d'un produit (ADM-21) */
const getPriceHistory = async (req, res, next) => {
  try {
    const result = await productAdminService.getPriceHistory(parseInt(req.params.id, 10), {
      page:  parseInt(req.query.page, 10)  || 1,
      limit: parseInt(req.query.limit, 10) || 50,
    });
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAll, getById, create, update, remove,
  uploadImage, removeImage, setPrimaryImage, setFeatured, updateFeaturedOrder,
  getPriceHistory,
};
