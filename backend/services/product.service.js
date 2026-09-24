const productRepository = require('../repositories/product.repository');
const categoryRepository = require('../repositories/category.repository');
const { cache, cacheSet, TTL, keys } = require('../config/cache');
const { AppError } = require('../middlewares/errorHandler');
const { normalizeLocale } = require('../utils/locale.utils');
const searchLogService = require('./searchLog.service');

/* Texte de recherche : chaîne uniquement, bornée à 120 caractères — le plus long
   nom d'article en compte 101. Sans borne, une saisie de plusieurs milliers de
   caractères occupait la base près d'une seconde par requête. */
const MAX_SEARCH_LENGTH = 120;
const searchText = (value) => (typeof value === 'string' ? value.trim().slice(0, MAX_SEARCH_LENGTH).trim() : '');

// Limite max de résultats par page — protection contre les abus
const MAX_LIMIT = 100;

// Ids d'un rayon + enfants + petits-enfants (hiérarchie à 3 niveaux max),
// lus sur l'arborescence légère mise en cache
const getDescendantIds = async (categoryId) => {
  let tree = cache.get(keys.categoryTree());
  if (!tree) {
    tree = await categoryRepository.findTree();
    cacheSet(keys.categoryTree(), tree, TTL.CATEGORIES);
  }
  const children = tree.filter(c => c.parent_id === categoryId).map(c => c.id);
  const grandchildren = tree.filter(c => children.includes(c.parent_id)).map(c => c.id);
  return [categoryId, ...children, ...grandchildren];
};

const getAll = async (query) => {
  const locale = normalizeLocale(query.locale);
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(MAX_LIMIT, parseInt(query.limit) || 20);
  const sort = query.sort || 'created_at';
  const order = query.order || 'desc';

  const filters = {
    ...(searchText(query.q).length >= 2 && { q: searchText(query.q) }),
    ...(query.category && { categorySlug: query.category }),
    ...(query.brand && { brand: query.brand }),
    ...(query.min_price !== undefined && { minPrice: parseFloat(query.min_price) }),
    ...(query.max_price !== undefined && { maxPrice: parseFloat(query.max_price) }),
    ...(query.in_stock === 'true' && { inStock: true }),
    ...(query.made_to_order === 'true' && { madeToOrder: true }),
    ...(query.featured === 'true' && { featured: true }),
    ...(query.badge && { badge: query.badge }),
    ...(query.min_rating && { minRating: parseFloat(query.min_rating) }),
  };

  // Résolution du slug catégorie en id(s) pour la requête SQL
  // Hiérarchie à 3 niveaux : on inclut les enfants ET les petits-enfants de la catégorie ciblée
  if (filters.categorySlug) {
    const category = await categoryRepository.findBySlug(filters.categorySlug, locale);
    if (!category) throw new AppError('Catégorie introuvable.', 404);
    filters.categoryIds = await getDescendantIds(category.id);
    delete filters.categorySlug;
  }

  const filterKey = JSON.stringify({ ...filters, sort, order });
  const cacheKey = keys.productsList(locale, page, limit, filterKey);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const { rows, total, isFuzzy } = await productRepository.findAll({ locale, page, limit, sort, order, ...filters });

  const result = {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    /* Résultats approchés : la saisie exacte n'a rien donné, la boutique affiche
       « aucun résultat pour X — voici des articles proches ». Absent des réponses
       exactes pour ne pas alourdir le cas courant. */
    ...(isFuzzy && { isFuzzy: true }),
  };

  /* Recherche restée totalement infructueuse (même le repli anti-faute n'a rien
     donné) : on enregistre le terme pour que l'administration sache ce qui manque
     au catalogue. Aucune donnée personnelle — voir searchLog.service.js.
     Volontairement hors `await` : la cliente ne doit pas attendre l'écriture d'une
     statistique. Seule la 1re page est comptée, sinon parcourir la pagination
     gonflerait artificiellement le compteur.
     À noter : la réponse étant mise en cache 5 min, un même terme cherché plusieurs
     fois d'affilée n'est compté qu'une fois par fenêtre de cache — le classement
     relatif des termes reste juste, c'est lui qui intéresse l'administration. */
  if (filters.q && total === 0 && page === 1) {
    searchLogService.recordNoResult(filters.q, locale);
  }

  cacheSet(cacheKey, result, TTL.PRODUCTS);
  return result;
};

const getById = async (id, locale = 'fr') => {
  const cacheKey = keys.product(id, locale);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const product = await productRepository.findById(id, locale);
  if (!product) throw new AppError('Produit introuvable.', 404);

  cacheSet(cacheKey, product, TTL.PRODUCT);
  return product;
};

const getBySlug = async (slug, locale = 'fr') => {
  const cacheKey = keys.product(`slug:${slug}`, locale);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const product = await productRepository.findBySlug(slug, locale);
  if (!product) throw new AppError('Produit introuvable.', 404);

  cacheSet(cacheKey, product, TTL.PRODUCT);
  return product;
};

const search = async (query) => {
  const q = searchText(query.q);
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

  /* Un rayon montre TOUTE sa descendance, comme le filtre catégorie du
     catalogue : sans cela, les articles rangés dans une sous-catégorie
     n'apparaissaient pas dans leur rayon parent. Le défaut passait inaperçu
     tant que les sous-catégories servaient peu ; la cliente en utilise
     désormais pour 3 682 articles, qui devenaient introuvables en boutique. */
  const { rows, total } = await productRepository.findByCategoryIds({
    categoryIds: await getDescendantIds(category.id),
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

// Liste des marques du catalogue — pour le filtre boutique. Mise en cache (TTL catégories).
const getBrands = async () => {
  const cacheKey = keys.brands();
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const brands = await productRepository.findAllBrands();
  cacheSet(cacheKey, brands, TTL.CATEGORIES);
  return brands;
};

module.exports = { getAll, getById, getBySlug, search, getByCategorySlug, getBrands };
