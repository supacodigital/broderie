const crypto = require('crypto');
const consentRepository = require('../repositories/consent.repository');
const env = require('../config/env');

// Hache une IP en HMAC-SHA-256 avec le poivre serveur — un SHA-256 nu d'IPv4
// serait réversible par force brute (LPD).
const hashIp = (rawIp) =>
  crypto.createHmac('sha256', env.consentIpPepper).update(rawIp || '').digest('hex');

// Enregistre le consentement. Best-effort : ne jamais faire échouer la requête
// HTTP pour un problème de log, mais tracer côté serveur.
const record = async ({ userId, sessionId, rawIp, type, accepted, version }) => {
  try {
    await consentRepository.logConsent({
      userId,
      sessionId,
      type,
      accepted,
      version,
      ipHash: hashIp(rawIp),
    });
    return true;
  } catch (err) {
    console.error('[Consent] Enregistrement échoué :', err.message);
    return false;
  }
};

module.exports = { record, hashIp };
