const productService = require('../services/product.service');
const { normalizeLocale } = require('../utils/locale.utils');

const getAll = async (req, res, next) => {
  try {
    const result = await productService.getAll(req.query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const locale = normalizeLocale(req.query.locale);
    const product = await productService.getById(id, locale);
    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

const getBySlug = async (req, res, next) => {
  try {
    const locale = normalizeLocale(req.query.locale);
    const product = await productService.getBySlug(req.params.slug, locale);
    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

const search = async (req, res, next) => {
  try {
    const result = await productService.search(req.query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

// Liste des marques / éditeurs présents au catalogue — alimente le filtre boutique
const getBrands = async (req, res, next) => {
  try {
    const data = await productService.getBrands();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll, getById, getBySlug, search, getBrands };
