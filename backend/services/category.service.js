const categoryRepository = require('../repositories/category.repository');
const { cache, cacheSet, TTL, keys } = require('../config/cache');

const getAll = async (locale) => {
  const cacheKey = keys.categories(locale);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const categories = await categoryRepository.findAll(locale);
  cacheSet(cacheKey, categories, TTL.CATEGORIES);
  return categories;
};

const getBySlug = async (slug, locale) => {
  const category = await categoryRepository.findBySlug(slug, locale);
  return category;
};

module.exports = { getAll, getBySlug };
