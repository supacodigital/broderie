const categoryAdminRepository = require('../../repositories/category.admin.repository');
const { AppError } = require('../../middlewares/errorHandler');
const { cache, keys, TTL } = require('../../config/cache');
const { mapDbError } = require('../../utils/db.utils');

// Invalide le cache des catégories pour toutes les locales
const invalidateCategories = () => {
  const catKeys = cache.keys().filter((k) => k.startsWith('categories'));
  cache.del(catKeys);
};

// Erreurs métier levées par category.admin.repository.js (profondeur, cycle parent/enfant)
// — toutes portent sur le choix de la catégorie parente, donc mappées sur ce champ
const isParentBusinessError = (error) =>
  error.message?.includes('profondeur') || error.message?.includes('propre parent') || error.message?.includes('descendante');

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

    if (!slug) {
      return res.status(400).json({ success: false, message: 'Données invalides.', errors: [{ field: 'slug', message: 'Le slug est obligatoire.' }] });
    }
    if (!translations?.fr?.name) {
      return res.status(400).json({ success: false, message: 'Données invalides.', errors: [{ field: 'name', message: 'Le nom (français) est obligatoire.' }] });
    }

    const exists = await categoryAdminRepository.slugExists(slug);
    if (exists) {
      return res.status(409).json({ success: false, message: 'Données invalides.', errors: [{ field: 'slug', message: 'Ce slug est déjà utilisé par une autre catégorie.' }] });
    }

    const categoryId = await categoryAdminRepository.create({ parentId, slug, imageUrl, sortOrder, translations });
    invalidateCategories();

    const category = await categoryAdminRepository.findById(categoryId);
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    if (isParentBusinessError(error)) {
      return res.status(400).json({ success: false, message: 'Données invalides.', errors: [{ field: 'parentId', message: error.message }] });
    }
    next(mapDbError(error));
  }
};

const update = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { parentId, slug, imageUrl, sortOrder, translations } = req.body;

    if (!slug) {
      return res.status(400).json({ success: false, message: 'Données invalides.', errors: [{ field: 'slug', message: 'Le slug est obligatoire.' }] });
    }

    const existing = await categoryAdminRepository.findById(id);
    if (!existing) return next(new AppError('Catégorie introuvable.', 404));

    const slugTaken = await categoryAdminRepository.slugExists(slug, id);
    if (slugTaken) {
      return res.status(409).json({ success: false, message: 'Données invalides.', errors: [{ field: 'slug', message: 'Ce slug est déjà utilisé par une autre catégorie.' }] });
    }

    await categoryAdminRepository.update(id, { parentId, slug, imageUrl, sortOrder, translations });
    invalidateCategories();

    const category = await categoryAdminRepository.findById(id);
    res.json({ success: true, data: category });
  } catch (error) {
    if (isParentBusinessError(error)) {
      return res.status(400).json({ success: false, message: 'Données invalides.', errors: [{ field: 'parentId', message: error.message }] });
    }
    next(mapDbError(error));
  }
};

const remove = async (req, res, next) => {
  try {
    await categoryAdminRepository.remove(parseInt(req.params.id));
    invalidateCategories();
    res.json({ success: true, message: 'Catégorie supprimée.' });
  } catch (error) {
    // Erreur métier (sous-catégories ou produits liés) — retournée telle quelle, déjà lisible
    if (error.message.startsWith('Impossible de supprimer')) {
      return next(new AppError(error.message, 400));
    }
    next(mapDbError(error));
  }
};

module.exports = { getAll, getById, create, update, remove };
