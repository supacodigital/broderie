/* Configuration transporteur Swiss Post (La Poste CH) — Digital Commerce API (OAuth2)
   En attente des accès API : CLIENT_ID, CLIENT_SECRET, KUNDENNUMMER, FRANKIERNUMMER
   Démarche d'obtention des accès : voir claude_task.md (section « API La Poste CH »).
   Le service shipping.service.js fonctionne en mode mock tant que clientId est vide. */

const env = require('./env');

const SWISS_POST_CONFIG = {
  clientId:        env.swissPostClientId,
  clientSecret:    env.swissPostClientSecret,
  kundennummer:    env.swissPostKundennummer,
  frankiernummer:  env.swissPostFrankiernummer,
  tokenUrl:        env.swissPostTokenUrl,
  labelUrl:        env.swissPostLabelUrl,
  scope:           env.swissPostScope,
  /* Mode mock actif tant que les identifiants OAuth2 ne sont pas configurés
     (placeholder « change_me » du .env.example traité comme non configuré). */
  isMock: !env.swissPostClientId || env.swissPostClientId.includes('change_me'),
}

if (SWISS_POST_CONFIG.isMock) {
  console.warn('[Swiss Post] Accès API non configurés — mode mock actif (shipping.service.js)')
}

module.exports = SWISS_POST_CONFIG
