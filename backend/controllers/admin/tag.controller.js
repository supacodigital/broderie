const tagAdminRepository = require('../../repositories/tag.admin.repository');
const { AppError } = require('../../middlewares/errorHandler');
const { cache } = require('../../config/cache');
const { mapDbError } = require('../../utils/db.utils');

// Invalide le cache des tags pour toutes les locales
const invalidateTags = () => {
  const tagKeys = cache.keys().filter((k) => k.startsWith('tags'));
  cache.del(tagKeys);
};

const getAll = async (req, res, next) => {
  try {
    const tags = await tagAdminRepository.findAll();
    res.json({ success: true, data: tags });
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const tag = await tagAdminRepository.findById(parseInt(req.params.id));
    if (!tag) return next(new AppError('Tag introuvable.', 404));
    res.json({ success: true, data: tag });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const { slug, sortOrder, translations } = req.body;

    if (!slug) {
      return res.status(400).json({ success: false, message: 'Données invalides.', errors: [{ field: 'slug', message: 'Le slug est obligatoire.' }] });
    }
    if (!translations?.fr?.name) {
      return res.status(400).json({ success: false, message: 'Données invalides.', errors: [{ field: 'name', message: 'Le nom (français) est obligatoire.' }] });
    }

    const exists = await tagAdminRepository.slugExists(slug);
    if (exists) {
      return res.status(409).json({ success: false, message: 'Données invalides.', errors: [{ field: 'slug', message: 'Ce slug est déjà utilisé par un autre tag.' }] });
    }

    const tagId = await tagAdminRepository.create({ slug, sortOrder, translations });
    invalidateTags();

    const tag = await tagAdminRepository.findById(tagId);
    res.status(201).json({ success: true, data: tag });
  } catch (error) {
    next(mapDbError(error));
  }
};

const update = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { slug, sortOrder, translations } = req.body;

    if (!slug) {
      return res.status(400).json({ success: false, message: 'Données invalides.', errors: [{ field: 'slug', message: 'Le slug est obligatoire.' }] });
    }

    const existing = await tagAdminRepository.findById(id);
    if (!existing) return next(new AppError('Tag introuvable.', 404));

    const slugTaken = await tagAdminRepository.slugExists(slug, id);
    if (slugTaken) {
      return res.status(409).json({ success: false, message: 'Données invalides.', errors: [{ field: 'slug', message: 'Ce slug est déjà utilisé par un autre tag.' }] });
    }

    await tagAdminRepository.update(id, { slug, sortOrder, translations });
    invalidateTags();

    const tag = await tagAdminRepository.findById(id);
    res.json({ success: true, data: tag });
  } catch (error) {
    next(mapDbError(error));
  }
};

const remove = async (req, res, next) => {
  try {
    await tagAdminRepository.remove(parseInt(req.params.id));
    invalidateTags();
    res.json({ success: true, message: 'Tag supprimé.' });
  } catch (error) {
    next(mapDbError(error));
  }
};

module.exports = { getAll, getById, create, update, remove };
