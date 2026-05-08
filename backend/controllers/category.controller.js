const categoryService = require('../services/category.service');
const { normalizeLocale } = require('../utils/locale.utils');

const getAll = async (req, res, next) => {
  try {
    const locale = normalizeLocale(req.query.locale);
    const categories = await categoryService.getAll(locale);
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
};

const getProducts = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const result = await require('../services/product.service').getByCategorySlug(slug, req.query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll, getProducts };
