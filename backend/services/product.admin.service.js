const productAdminRepository = require('../repositories/product.admin.repository');
const { processImage }       = require('../config/sharp');
const { invalidateProducts } = require('../config/cache');
const { AppError }           = require('../middlewares/errorHandler');
const { mapDbError }         = require('../utils/db.utils');
const {
  productCreateSchema, productUpdateSchema, featuredOrderSchema,
} = require('../validators/product.validator');

const ALLOWED_SORT_FIELDS = ['created_at', 'price_chf', 'name', 'stock'];

const parseOrThrow = (schema, body) => {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
    throw new AppError('Données invalides.', 400, errors);
  }
  return parsed.data;
};

// Normalise les filtres de la liste admin depuis req.query
const buildListFilters = (query) => ({
  page:  Math.max(1, parseInt(query.page) || 1),
  limit: Math.min(100, parseInt(query.limit) || 20),
  search: query.q || '',
  sort:  ALLOWED_SORT_FIELDS.includes(query.sort) ? query.sort : 'created_at',
  order: query.order === 'asc' ? 'asc' : 'desc',
  categoryId: query.category_id ? parseInt(query.category_id) : null,
  supplierId: query.supplier_id ? parseInt(query.supplier_id) : null,
  minPrice:   query.min_price ? parseFloat(query.min_price) : null,
  maxPrice:   query.max_price ? parseFloat(query.max_price) : null,
  inStock:    query.in_stock === 'true',
  lowStock:   query.low_stock === 'true',
  isActive:   query.is_active === 'true' ? true : query.is_active === 'false' ? false : null,
  isFeatured: query.is_featured === 'true' ? true : query.is_featured === 'false' ? false : null,
});

const list = async (query) => {
  const filters = buildListFilters(query);
  const { rows, total } = await productAdminRepository.findAllAdmin(filters);
  return {
    data: rows,
    pagination: {
      page: filters.page, limit: filters.limit, total,
      totalPages: Math.ceil(total / filters.limit),
    },
  };
};

const getById = async (id, locale) => {
  const product = await productAdminRepository.findByIdAdmin(id, locale);
  if (!product) throw new AppError('Produit introuvable.', 404);
  return product;
};

const create = async (body) => {
  const data = parseOrThrow(productCreateSchema, body);

  if (await productAdminRepository.skuExists(data.sku)) {
    throw new AppError('Données invalides.', 409, [
      { field: 'sku', message: 'Cette référence (SKU) est déjà utilisée par un autre produit.' },
    ]);
  }

  // Le slug est généré depuis le nom côté formulaire, l'admin ne le voit pas —
  // en cas de collision on le rend unique automatiquement plutôt que de bloquer.
  let uniqueSlug = data.slug;
  let suffix = 2;
  while (await productAdminRepository.slugExists(uniqueSlug)) {
    uniqueSlug = `${data.slug}-${suffix}`;
    suffix += 1;
  }

  try {
    const id = await productAdminRepository.create({ ...data, slug: uniqueSlug });
    invalidateProducts();
    return productAdminRepository.findByIdAdmin(id, 'fr');
  } catch (error) {
    throw mapDbError(error);
  }
};

const update = async (id, body) => {
  if (!id || id < 1) throw new AppError('ID produit invalide.', 400);
  const data = parseOrThrow(productUpdateSchema, body);

  const conflicts = [];
  if (data.slug && await productAdminRepository.slugExists(data.slug, id)) {
    conflicts.push({ field: 'slug', message: 'Ce slug est déjà utilisé par un autre produit.' });
  }
  if (data.sku && await productAdminRepository.skuExists(data.sku, id)) {
    conflicts.push({ field: 'sku', message: 'Cette référence (SKU) est déjà utilisée par un autre produit.' });
  }
  if (conflicts.length > 0) {
    throw new AppError('Données invalides.', 409, conflicts);
  }

  try {
    await productAdminRepository.update(id, data);
    invalidateProducts();
    const product = await productAdminRepository.findByIdAdmin(id, 'fr');
    if (!product) throw new AppError('Produit introuvable.', 404);
    return product;
  } catch (error) {
    throw error instanceof AppError ? error : mapDbError(error);
  }
};

const remove = async (id) => {
  await productAdminRepository.softDelete(id);
  invalidateProducts();
};

// Upload : conversion WebP + 3 tailles (sharp) + enregistrement
const addImage = async (productId, file, { isPrimary = false, alt = null, sortOrder = 0 } = {}) => {
  if (!file) throw new AppError('Aucun fichier reçu.', 400);

  // Vérifier l'existence du produit AVANT de générer 3 fichiers qui seraient orphelins
  const product = await productAdminRepository.findByIdAdmin(productId, 'fr');
  if (!product) throw new AppError('Produit introuvable.', 404);

  const { urls } = await processImage(file.buffer);
  const imageId = await productAdminRepository.addImage({
    productId,
    url: urls.large,
    urlThumbnail: urls.thumbnail,
    urlMedium: urls.medium,
    urlLarge: urls.large,
    alt,
    sortOrder,
    isPrimary,
  });

  invalidateProducts();
  return { id: imageId, url: urls.large, alt, is_primary: isPrimary ? 1 : 0, sort_order: sortOrder };
};

const removeImage = async (imageId, productId) => {
  const deleted = await productAdminRepository.removeImage(imageId, productId);
  if (!deleted) throw new AppError('Image introuvable.', 404);
  invalidateProducts();
};

const setPrimaryImage = async (imageId, productId) => {
  const ok = await productAdminRepository.setPrimaryImage(imageId, productId);
  if (!ok) throw new AppError('Image introuvable.', 404);
  invalidateProducts();
};

const updateFeaturedOrder = async (body) => {
  const { productIds } = parseOrThrow(featuredOrderSchema, body);
  try {
    await productAdminRepository.updateFeaturedOrder(productIds);
    invalidateProducts();
  } catch (error) {
    throw mapDbError(error);
  }
};

module.exports = {
  list, getById, create, update, remove,
  addImage, removeImage, setPrimaryImage, updateFeaturedOrder,
};
