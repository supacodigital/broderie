const tagService = require('../services/tag.service');
const { normalizeLocale } = require('../utils/locale.utils');

const getAll = async (req, res, next) => {
  try {
    const locale = normalizeLocale(req.query.locale);
    const tags = await tagService.getAll(locale);
    res.json({ success: true, data: tags });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll };
