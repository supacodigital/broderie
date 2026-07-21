const tagRepository = require('../repositories/tag.repository');
const { cache, TTL, keys } = require('../config/cache');

const getAll = async (locale) => {
  const cacheKey = keys.tags(locale);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const tags = await tagRepository.findAll(locale);
  cache.set(cacheKey, tags, TTL.TAGS);
  return tags;
};

module.exports = { getAll };
