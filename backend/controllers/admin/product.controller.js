const productAdminRepository = require('../../repositories/product.admin.repository');
const { processImage } = require('../../config/sharp');
const { invalidateProducts } = require('../../config/cache');
const { AppError } = require('../../middlewares/errorHandler');
const { normalizeLocale } = require('../../utils/locale.utils');

const getAll = async (req, res, next) => {
  try {
    const page       = Math.max(1, parseInt(req.query.page) || 1);
    const limit      = Math.min(100, parseInt(req.query.limit) || 20);
    const search     = req.query.q || '';
    const categoryId = req.query.category_id ? parseInt(req.query.category_id) : null;
    const { rows, total } = await productAdminRepository.findAllAdmin({ page, limit, search, categoryId });
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
    const product = await productAdminRepository.findByIdAdmin(parseInt(req.params.id), normalizeLocale(req.query.locale));
    if (!product) return next(new AppError('Produit introuvable.', 404));
    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const { categoryId, supplierId, slug, priceChf, comparePriceChf, taxRateId, sku, stock, weightKg, isFeatured, badge, translations } = req.body;

    if (!categoryId || !slug || !priceChf || !taxRateId) {
      return next(new AppError('Champs obligatoires manquants : categoryId, slug, priceChf, taxRateId.', 400));
    }
    if (!translations?.fr?.name) {
      return next(new AppError('La traduction française (translations.fr.name) est obligatoire.', 400));
    }

    const productId = await productAdminRepository.create({
      categoryId, supplierId, slug, priceChf, comparePriceChf, taxRateId, sku, stock, weightKg, isFeatured, badge, translations,
    });

    invalidateProducts();
    const product = await productAdminRepository.findByIdAdmin(productId, 'fr');
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { categoryId, supplierId, slug, priceChf, comparePriceChf, taxRateId, sku, stock, weightKg, isFeatured, isActive, badge, translations } = req.body;

    await productAdminRepository.update(id, {
      categoryId, supplierId, slug, priceChf, comparePriceChf, taxRateId, sku, stock, weightKg, isFeatured, isActive, badge, translations,
    });

    invalidateProducts();
    const product = await productAdminRepository.findByIdAdmin(id, 'fr');
    if (!product) return next(new AppError('Produit introuvable.', 404));
    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await productAdminRepository.softDelete(parseInt(req.params.id));
    invalidateProducts();
    res.json({ success: true, message: 'Produit supprimé.' });
  } catch (error) {
    next(error);
  }
};

// Upload, conversion WebP et stockage des 3 tailles
const uploadImage = async (req, res, next) => {
  try {
    const productId = parseInt(req.params.id);
    if (!req.file) return next(new AppError('Aucun fichier reçu.', 400));

    const { urls } = await processImage(req.file.buffer);
    const isPrimary  = req.body.isPrimary === 'true';
    const alt        = req.body.alt || null;
    const sortOrder  = parseInt(req.body.sortOrder) || 0;

    const imageId = await productAdminRepository.addImage({
      productId,
      url: urls.large,
      alt,
      sortOrder,
      isPrimary,
    });

    invalidateProducts();
    res.status(201).json({
      success: true,
      data: { id: imageId, url: urls.large, alt, is_primary: isPrimary ? 1 : 0, sort_order: sortOrder },
    });
  } catch (error) {
    next(error);
  }
};

const removeImage = async (req, res, next) => {
  try {
    const productId = parseInt(req.params.id);
    const imageId = parseInt(req.params.imageId);
    const deleted = await productAdminRepository.removeImage(imageId, productId);
    if (!deleted) return next(new AppError('Image introuvable.', 404));
    invalidateProducts();
    res.json({ success: true, message: 'Image supprimée.' });
  } catch (error) {
    next(error);
  }
};

const setPrimaryImage = async (req, res, next) => {
  try {
    const productId = parseInt(req.params.id);
    const imageId   = parseInt(req.params.imageId);
    const ok = await productAdminRepository.setPrimaryImage(imageId, productId);
    if (!ok) return next(new AppError('Image introuvable.', 404));
    invalidateProducts();
    res.json({ success: true, message: 'Image principale mise à jour.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll, getById, create, update, remove, uploadImage, removeImage, setPrimaryImage };
