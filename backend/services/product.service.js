const productRepository = require('../repositories/product.repository');
const categoryRepository = require('../repositories/category.repository');
const { cache, TTL, keys } = require('../config/cache');
const { AppError } = require('../middlewares/errorHandler');
const { normalizeLocale } = require('../utils/locale.utils');

// Limite max de résultats par page — protection contre les abus
const MAX_LIMIT = 100;

const getAll = async (query) => {
  const locale = normalizeLocale(query.locale);
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(MAX_LIMIT, parseInt(query.limit) || 20);
  const sort = query.sort || 'created_at';
  const order = query.order || 'desc';

  const filters = {
    ...(query.q?.trim().length >= 2 && { q: query.q.trim() }),
    ...(query.category && { categorySlug: query.category }),
    ...(query.min_price !== undefined && { minPrice: parseFloat(query.min_price) }),
    ...(query.max_price !== undefined && { maxPrice: parseFloat(query.max_price) }),
    ...(query.in_stock === 'true' && { inStock: true }),
    ...(query.made_to_order === 'true' && { madeToOrder: true }),
    ...(query.featured === 'true' && { featured: true }),
    ...(query.badge && { badge: query.badge }),
    ...(query.min_rating && { minRating: parseFloat(query.min_rating) }),
  };

  // Résolution du slug catégorie en id(s) pour la requête SQL
  // Si la catégorie a des enfants, on inclut aussi leurs produits
  if (filters.categorySlug) {
    const category = await categoryRepository.findBySlug(filters.categorySlug, locale);
    if (!category) throw new AppError('Catégorie introuvable.', 404);
    const allCats = await categoryRepository.findAll(locale);
    const children = allCats.filter(c => c.parent_id === category.id).map(c => c.id);
    filters.categoryIds = children.length > 0 ? [category.id, ...children] : [category.id];
    delete filters.categorySlug;
  }

  const filterKey = JSON.stringify({ ...filters, sort, order });
  const cacheKey = keys.productsList(locale, page, limit, filterKey);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const { rows, total } = await productRepository.findAll({ locale, page, limit, sort, order, ...filters });

  const result = {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };

  cache.set(cacheKey, result, TTL.PRODUCTS);
  return result;
};

const getById = async (id, locale = 'fr') => {
  const cacheKey = keys.product(id, locale);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const product = await productRepository.findById(id, locale);
  if (!product) throw new AppError('Produit introuvable.', 404);

  cache.set(cacheKey, product, TTL.PRODUCT);
  return product;
};

const getBySlug = async (slug, locale = 'fr') => {
  const cacheKey = keys.product(`slug:${slug}`, locale);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const product = await productRepository.findBySlug(slug, locale);
  if (!product) throw new AppError('Produit introuvable.', 404);

  cache.set(cacheKey, product, TTL.PRODUCT);
  return product;
};

const search = async (query) => {
  const q = (query.q || '').trim();
  if (!q || q.length < 2) throw new AppError('Le terme de recherche doit contenir au moins 2 caractères.', 400);

  const locale = normalizeLocale(query.locale);
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(MAX_LIMIT, parseInt(query.limit) || 20);

  const { rows, total } = await productRepository.search({ q, locale, page, limit });

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getByCategorySlug = async (slug, query) => {
  const locale = normalizeLocale(query.locale);
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(MAX_LIMIT, parseInt(query.limit) || 20);
  const sort = query.sort || 'created_at';
  const order = query.order || 'desc';

  const category = await categoryRepository.findBySlug(slug, locale);
  if (!category) throw new AppError('Catégorie introuvable.', 404);

  const { rows, total } = await productRepository.findByCategoryId({
    categoryId: category.id,
    locale, page, limit, sort, order,
  });

  return {
    category,
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

module.exports = { getAll, getById, getBySlug, search, getByCategorySlug };
