const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { pool } = require('../config/db');

/* POST /api/v1/consent — log du consentement cookies (LPD art. 6) */
router.post('/', async (req, res) => {
  try {
    const { type = 'cookies', accepted, version = '1.0' } = req.body;

    /* IP hashée en SHA-256 — jamais stockée en clair (LPD) */
    const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || '';
    const ipHash = crypto.createHash('sha256').update(rawIp).digest('hex');

    const userId    = req.user?.id ?? null;
    const sessionId = req.cookies?.session_id ?? null;

    await pool.execute(
      `INSERT INTO consent_logs (user_id, session_id, type, version, ip_hash, accepted_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [userId, sessionId, type, version, ipHash]
    );

    res.json({ success: true, message: 'Consentement enregistré.' });
  } catch {
    /* Silencieux — ne jamais bloquer l'utilisateur pour un log */
    res.json({ success: true });
  }
});

module.exports = router;
