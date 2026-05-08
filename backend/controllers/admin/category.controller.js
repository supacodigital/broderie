const categoryAdminRepository = require('../../repositories/category.admin.repository');
const { AppError } = require('../../middlewares/errorHandler');
const { cache, keys, TTL } = require('../../config/cache');

// Invalide le cache des catégories pour toutes les locales
const invalidateCategories = () => {
  const catKeys = cache.keys().filter((k) => k.startsWith('categories'));
  cache.del(catKeys);
};

const getAll = async (req, res, next) => {
  try {
    const categories = await categoryAdminRepository.findAll();
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const category = await categoryAdminRepository.findById(parseInt(req.params.id));
    if (!category) return next(new AppError('Catégorie introuvable.', 404));
    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const { parentId, slug, imageUrl, sortOrder, translations } = req.body;

    if (!slug) return next(new AppError('Le slug est obligatoire.', 400));
    if (!translations?.fr?.name) {
      return next(new AppError('La traduction française (translations.fr.name) est obligatoire.', 400));
    }

    const exists = await categoryAdminRepository.slugExists(slug);
    if (exists) return next(new AppError('Ce slug est déjà utilisé.', 409));

    const categoryId = await categoryAdminRepository.create({ parentId, slug, imageUrl, sortOrder, translations });
    invalidateCategories();

    const category = await categoryAdminRepository.findById(categoryId);
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { parentId, slug, imageUrl, sortOrder, translations } = req.body;

    if (!slug) return next(new AppError('Le slug est obligatoire.', 400));

    const existing = await categoryAdminRepository.findById(id);
    if (!existing) return next(new AppError('Catégorie introuvable.', 404));

    const slugTaken = await categoryAdminRepository.slugExists(slug, id);
    if (slugTaken) return next(new AppError('Ce slug est déjà utilisé.', 409));

    await categoryAdminRepository.update(id, { parentId, slug, imageUrl, sortOrder, translations });
    invalidateCategories();

    const category = await categoryAdminRepository.findById(id);
    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await categoryAdminRepository.remove(parseInt(req.params.id));
    invalidateCategories();
    res.json({ success: true, message: 'Catégorie supprimée.' });
  } catch (error) {
    // Erreur métier (produits liés) — retourner un 400 clair
    if (error.message.startsWith('Impossible de supprimer')) {
      return next(new AppError(error.message, 400));
    }
    next(error);
  }
};

module.exports = { getAll, getById, create, update, remove };
