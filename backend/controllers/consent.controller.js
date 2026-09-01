const consentService = require('../services/consent.service');

// POST /api/v1/consent — journalise le choix de consentement cookies (LPD art. 6).
// req.body est déjà validé/normalisé par le middleware validate (routes/consent.routes.js).
const create = async (req, res) => {
  const { type, accepted, version } = req.body;

  await consentService.record({
    userId:    req.user?.id ?? null,
    sessionId: req.cookies?.cartSession ?? null,
    rawIp:     req.ip || req.socket.remoteAddress, // req.ip respecte trust proxy en prod
    type,
    accepted,
    version,
  });

  // Toujours 200 : un échec d'enregistrement ne doit pas bloquer le visiteur
  res.json({ success: true, message: 'Consentement enregistré.' });
};

module.exports = { create };
