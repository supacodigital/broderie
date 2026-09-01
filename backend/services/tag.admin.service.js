const tagAdminRepository = require('../repositories/tag.admin.repository');
const { AppError } = require('../middlewares/errorHandler');
const { cache } = require('../config/cache');
const { mapDbError } = require('../utils/db.utils');
const { tagShapeSchema } = require('../validators/tag.validator');

const invalidateCache = () => {
  const tagKeys = cache.keys().filter((k) => k.startsWith('tags'));
  if (tagKeys.length) cache.del(tagKeys);
};

const validate = (body) => {
  const parsed = tagShapeSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
    throw new AppError('Données invalides.', 400, errors);
  }
  if (!body.slug) {
    throw new AppError('Données invalides.', 400, [{ field: 'slug', message: 'Le slug est obligatoire.' }]);
  }
};

const listAll = () => tagAdminRepository.findAll();

const getById = async (id) => {
  const tag = await tagAdminRepository.findById(id);
  if (!tag) throw new AppError('Tag introuvable.', 404);
  return tag;
};

const create = async (body) => {
  validate(body);
  if (!body.translations?.fr?.name) {
    throw new AppError('Données invalides.', 400, [{ field: 'name', message: 'Le nom (français) est obligatoire.' }]);
  }
  if (await tagAdminRepository.slugExists(body.slug)) {
    throw new AppError('Données invalides.', 409, [{ field: 'slug', message: 'Ce slug est déjà utilisé par un autre tag.' }]);
  }

  try {
    const id = await tagAdminRepository.create(body);
    invalidateCache();
    return tagAdminRepository.findById(id);
  } catch (error) {
    throw mapDbError(error);
  }
};

const update = async (id, body) => {
  validate(body);

  const existing = await tagAdminRepository.findById(id);
  if (!existing) throw new AppError('Tag introuvable.', 404);

  if (await tagAdminRepository.slugExists(body.slug, id)) {
    throw new AppError('Données invalides.', 409, [{ field: 'slug', message: 'Ce slug est déjà utilisé par un autre tag.' }]);
  }

  try {
    await tagAdminRepository.update(id, body);
    invalidateCache();
    return tagAdminRepository.findById(id);
  } catch (error) {
    throw mapDbError(error);
  }
};

const remove = async (id) => {
  try {
    await tagAdminRepository.remove(id);
    invalidateCache();
  } catch (error) {
    throw mapDbError(error);
  }
};

module.exports = { listAll, getById, create, update, remove, invalidateCache };
