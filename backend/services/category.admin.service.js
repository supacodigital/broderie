const categoryAdminRepository = require('../repositories/category.admin.repository');
const { AppError } = require('../middlewares/errorHandler');
const { cache } = require('../config/cache');
const { mapDbError } = require('../utils/db.utils');
const { categoryShapeSchema } = require('../validators/category.validator');

// Invalide le cache des catégories (toutes locales)
const invalidateCache = () => {
  const catKeys = cache.keys().filter((k) => k.startsWith('categories'));
  if (catKeys.length) cache.del(catKeys);
};

// Erreurs métier de hiérarchie levées par le repository (profondeur, cycle) —
// toutes liées au choix du parent.
const isParentBusinessError = (error) =>
  /profondeur|propre parent|descendante/i.test(error.message || '');

// Valide la forme (longueurs, slug, imageUrl) + les champs obligatoires métier.
const validate = (body, { requireSlug = true } = {}) => {
  const parsed = categoryShapeSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
    throw new AppError('Données invalides.', 400, errors);
  }
  if (requireSlug && !body.slug) {
    throw new AppError('Données invalides.', 400, [{ field: 'slug', message: 'Le slug est obligatoire.' }]);
  }
};

const listAll = () => categoryAdminRepository.findAll();

const getById = async (id) => {
  const category = await categoryAdminRepository.findById(id);
  if (!category) throw new AppError('Catégorie introuvable.', 404);
  return category;
};

const create = async (body) => {
  validate(body);
  if (!body.translations?.fr?.name) {
    throw new AppError('Données invalides.', 400, [{ field: 'name', message: 'Le nom (français) est obligatoire.' }]);
  }
  if (await categoryAdminRepository.slugExists(body.slug)) {
    throw new AppError('Données invalides.', 409, [{ field: 'slug', message: 'Ce slug est déjà utilisé par une autre catégorie.' }]);
  }

  try {
    const id = await categoryAdminRepository.create(body);
    invalidateCache();
    return categoryAdminRepository.findById(id);
  } catch (error) {
    if (isParentBusinessError(error)) {
      throw new AppError('Données invalides.', 400, [{ field: 'parentId', message: error.message }]);
    }
    throw mapDbError(error);
  }
};

const update = async (id, body) => {
  validate(body);

  const existing = await categoryAdminRepository.findById(id);
  if (!existing) throw new AppError('Catégorie introuvable.', 404);

  if (await categoryAdminRepository.slugExists(body.slug, id)) {
    throw new AppError('Données invalides.', 409, [{ field: 'slug', message: 'Ce slug est déjà utilisé par une autre catégorie.' }]);
  }

  try {
    await categoryAdminRepository.update(id, body);
    invalidateCache();
    return categoryAdminRepository.findById(id);
  } catch (error) {
    if (isParentBusinessError(error)) {
      throw new AppError('Données invalides.', 400, [{ field: 'parentId', message: error.message }]);
    }
    throw mapDbError(error);
  }
};

const remove = async (id) => {
  try {
    await categoryAdminRepository.remove(id);
    invalidateCache();
  } catch (error) {
    // Erreur métier (sous-catégories / produits liés) — message déjà lisible
    if (error.message?.startsWith('Impossible de supprimer')) {
      throw new AppError(error.message, 400);
    }
    throw mapDbError(error);
  }
};

module.exports = { listAll, getById, create, update, remove, invalidateCache };
