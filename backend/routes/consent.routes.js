const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { z }   = require('zod');
const { pool } = require('../config/db');
const env = require('../config/env');
const { optionalAuth } = require('../middlewares/optionalAuth');

// Schéma d'entrée — `accepted` est le cœur de la preuve de consentement (accepté vs refusé)
const consentSchema = z.object({
  type:     z.enum(['cookies']).default('cookies'),
  accepted: z.boolean(),
  version:  z.string().min(1).max(20).default('1.0'),
});

/* POST /api/v1/consent — journalise le choix de consentement cookies (LPD art. 6) */
router.post('/', optionalAuth, async (req, res) => {
  const parsed = consentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Données de consentement invalides.' });
  }
  const { type, accepted, version } = parsed.data;

  try {
    /* IP hachée en HMAC-SHA-256 avec un poivre serveur — jamais stockée en clair (LPD).
       Un SHA-256 nu d'IPv4 serait réversible par force brute ; le HMAC l'empêche.
       `req.ip` respecte `trust proxy` en production. */
    const rawIp  = req.ip || req.socket.remoteAddress || '';
    const ipHash = crypto.createHmac('sha256', env.consentIpPepper).update(rawIp).digest('hex');

    const userId    = req.user?.id ?? null;
    const sessionId = req.cookies?.cartSession ?? null;

    await pool.execute(
      `INSERT INTO consent_logs (user_id, session_id, type, accepted, version, ip_hash, accepted_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [userId, sessionId, type, accepted ? 1 : 0, version, ipHash]
    );

    res.json({ success: true, message: 'Consentement enregistré.' });
  } catch (err) {
    /* Ne jamais bloquer le visiteur pour un log — mais tracer l'échec côté serveur
       (une table consent_logs en panne est un problème de conformité à investiguer). */
    console.error('[Consent] Enregistrement échoué :', err.message);
    res.json({ success: true });
  }
});

module.exports = router;
