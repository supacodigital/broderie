const { z }                  = require('zod');
const productAdminRepository = require('../../repositories/product.admin.repository');
const { processImage }       = require('../../config/sharp');
const { invalidateProducts } = require('../../config/cache');
const { AppError }           = require('../../middlewares/errorHandler');
const { normalizeLocale }    = require('../../utils/locale.utils');

const ALLOWED_SORT_FIELDS = ['created_at', 'price_chf', 'name', 'stock'];

const translationSchema = z.object({
  name:        z.string().min(1).max(255),
  description: z.string().max(10000).optional().nullable(),
  slug:        z.string().max(255).optional().nullable(),
});

const productBodySchema = z.object({
  categoryId:      z.number().int().positive(),
  supplierId:      z.number().int().positive().optional().nullable(),
  slug:            z.string().min(1).max(255),
  priceChf:        z.number().positive().max(99999),
  comparePriceChf: z.number().positive().max(99999).optional().nullable(),
  taxRateId:       z.number().int().positive(),
  sku:             z.string().max(100).optional().nullable(),
  stock:           z.number().int().min(0).optional().default(0),
  weightKg:        z.number().positive().max(999).optional().nullable(),
  isFeatured:      z.boolean().optional().default(false),
  isMadeToOrder:   z.boolean().optional().default(false),
  badge:           z.string().max(50).optional().nullable(),
  translations: z.object({
    fr: translationSchema,
    de: translationSchema.optional(),
    en: translationSchema.optional(),
  }),
});

const productUpdateSchema = productBodySchema.partial().extend({
  isActive: z.boolean().optional(),
});

const getAll = async (req, res, next) => {
  try {
    const page        = Math.max(1, parseInt(req.query.page) || 1);
    const limit       = Math.min(100, parseInt(req.query.limit) || 20);
    const search      = req.query.q || '';
    const sort        = ALLOWED_SORT_FIELDS.includes(req.query.sort) ? req.query.sort : 'created_at';
    const order       = req.query.order === 'asc' ? 'asc' : 'desc';
    const categoryId  = req.query.category_id  ? parseInt(req.query.category_id)  : null;
    const supplierId  = req.query.supplier_id  ? parseInt(req.query.supplier_id)  : null;
    const minPrice    = req.query.min_price    ? parseFloat(req.query.min_price)  : null;
    const maxPrice    = req.query.max_price    ? parseFloat(req.query.max_price)  : null;
    const inStock     = req.query.in_stock     === 'true';
    const lowStock    = req.query.low_stock    === 'true';
    const isActive    = req.query.is_active    === 'true'  ? true
                      : req.query.is_active    === 'false' ? false : null;
    const isFeatured  = req.query.is_featured  === 'true'  ? true
                      : req.query.is_featured  === 'false' ? false : null;

    const { rows, total } = await productAdminRepository.findAllAdmin({
      page, limit, search, sort, order,
      categoryId, supplierId,
      minPrice, maxPrice,
      inStock, lowStock,
      isActive, isFeatured,
    });
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
    const parsed = productBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map(e => ({ field: e.path.join('.'), message: e.message }));
      return res.status(400).json({ success: false, message: 'Données invalides.', errors });
    }

    const { categoryId, supplierId, slug, priceChf, comparePriceChf, taxRateId, sku, stock, weightKg, isFeatured, isMadeToOrder, badge, translations } = parsed.data;
    const productId = await productAdminRepository.create({
      categoryId, supplierId, slug, priceChf, comparePriceChf, taxRateId, sku, stock, weightKg, isFeatured, isMadeToOrder, badge, translations,
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
    const id = parseInt(req.params.id, 10);
    if (!id || id < 1) return next(new AppError('ID produit invalide.', 400));

    const parsed = productUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map(e => ({ field: e.path.join('.'), message: e.message }));
      return res.status(400).json({ success: false, message: 'Données invalides.', errors });
    }

    const { categoryId, supplierId, slug, priceChf, comparePriceChf, taxRateId, sku, stock, weightKg, isFeatured, isMadeToOrder, isActive, badge, translations } = parsed.data;
    await productAdminRepository.update(id, {
      categoryId, supplierId, slug, priceChf, comparePriceChf, taxRateId, sku, stock, weightKg, isFeatured, isMadeToOrder, isActive, badge, translations,
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
