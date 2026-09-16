const searchLogService = require('../../services/searchLog.service');

/* Recherches restées sans résultat — aide l'administration à repérer ce qui
   manque au catalogue (référence absente, mot du métier pas dans les fiches,
   marque non distribuée). Aucune donnée personnelle n'est exposée : la table
   ne contient que des termes et des compteurs. */
const getNoResults = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);

    const { data, pagination } = await searchLogService.getNoResultTerms({ page, limit });

    res.json({ success: true, data, pagination });
  } catch (error) {
    next(error);
  }
};

module.exports = { getNoResults };
