const { z } = require('zod');
const consentService = require('../services/consent.service');

// `accepted` est le cœur de la preuve de consentement (accepté vs refusé)
const consentSchema = z.object({
  type:     z.enum(['cookies']).default('cookies'),
  accepted: z.boolean(),
  version:  z.string().min(1).max(20).default('1.0'),
});

// POST /api/v1/consent — journalise le choix de consentement cookies (LPD art. 6)
const create = async (req, res) => {
  const parsed = consentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Données de consentement invalides.' });
  }
  const { type, accepted, version } = parsed.data;

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
