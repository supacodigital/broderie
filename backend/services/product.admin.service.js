const productAdminRepository = require('../repositories/product.admin.repository');
const { processImage }       = require('../config/sharp');
const { invalidateProducts } = require('../config/cache');
const { AppError }           = require('../middlewares/errorHandler');
const { mapDbError }         = require('../utils/db.utils');
const {
  productCreateSchema, productUpdateSchema, featuredOrderSchema,
} = require('../validators/product.validator');

const ALLOWED_SORT_FIELDS = ['created_at', 'price_chf', 'name', 'stock'];

/* Les dates de promotion arrivent en ISO 8601 UTC depuis l'admin ; MySQL attend
   'YYYY-MM-DD HH:MM:SS'. La comparaison en base se fait avec NOW(), donc en heure
   du serveur : on convertit en heure locale du serveur, pas en UTC, sinon une
   promo s'ouvrirait ou se fermerait avec 1 à 2 heures de décalage selon la saison
   (l'heure suisse est UTC+1 ou UTC+2). Chaîne vide ou null = pas de borne. */
const toMysqlDateTime = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
       + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/* Convertit les bornes de promo et neutralise une promo sans prix barré :
   sans prix de référence, des dates seules n'auraient aucun effet. */
const normalizePromo = (data) => {
  const out = { ...data };
  if ('promoStartsAt' in out) out.promoStartsAt = toMysqlDateTime(out.promoStartsAt);
  if ('promoEndsAt'   in out) out.promoEndsAt   = toMysqlDateTime(out.promoEndsAt);
  if ('comparePriceChf' in out && !out.comparePriceChf) {
    out.promoStartsAt = null;
    out.promoEndsAt   = null;
  }
  return out;
};

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
  brand:      query.brand || null,
  minPrice:   query.min_price ? parseFloat(query.min_price) : null,
  maxPrice:   query.max_price ? parseFloat(query.max_price) : null,
  inStock:    query.in_stock === 'true',
  lowStock:   query.low_stock === 'true',
  isActive:   query.is_active === 'true' ? true : query.is_active === 'false' ? false : null,
  isFeatured: query.is_featured === 'true' ? true : query.is_featured === 'false' ? false : null,
  // Articles dont le classement reste à confirmer par la cliente (ADM-04)
  needsCategoryReview: query.needs_category_review === 'true' ? true
                     : query.needs_category_review === 'false' ? false : null,
  // Remonte les produits illustrés — utilisé par le sélecteur de la vitrine home
  imageFirst: query.image_first === 'true',
});

const list = async (query) => {
  const filters = buildListFilters(query);
  const { rows, total, isFuzzy } = await productAdminRepository.findAllAdmin(filters);
  return {
    data: rows,
    /* Résultats approchés : la saisie exacte n'a rien donné, l'administration
       affiche « aucun résultat exact — voici des articles proches ». */
    ...(isFuzzy && { isFuzzy: true }),
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
    const id = await productAdminRepository.create({ ...normalizePromo(data), slug: uniqueSlug });
    invalidateProducts();
    return productAdminRepository.findByIdAdmin(id, 'fr');
  } catch (error) {
    throw mapDbError(error);
  }
};

const update = async (id, body, { changedBy = null } = {}) => {
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
    // `changedBy` alimente l'historique des prix (ADM-21) — qui a changé quoi
    await productAdminRepository.update(id, normalizePromo(data), { changedBy });
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

/* Historique des prix d'un produit (ADM-21) — l'ordonnance sur l'indication des
   prix impose de pouvoir justifier un prix barré par un prix réellement pratiqué. */
const getPriceHistory = async (id, { page = 1, limit = 50 } = {}) => {
  if (!id || id < 1) throw new AppError('ID produit invalide.', 400);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const { rows, total } = await productAdminRepository.findPriceHistory(id, {
    limit: safeLimit,
    offset: (Math.max(1, page) - 1) * safeLimit,
  });
  return { rows, total, page: Math.max(1, page), limit: safeLimit };
};

module.exports = {
  list, getById, create, update, remove,
  addImage, removeImage, setPrimaryImage, updateFeaturedOrder, getPriceHistory,
};
