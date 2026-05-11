/* Configuration transporteur Swiss Post (La Poste CH)
   En attente des accès API : CLIENT_ID, CLIENT_SECRET, KUNDENNUMMER, FRANKIERNUMMER
   Le service shipping.service.js fonctionne en mode mock jusqu'à réception des accès. */

const SWISS_POST_CONFIG = {
  clientId:        process.env.SWISS_POST_CLIENT_ID        ?? null,
  clientSecret:    process.env.SWISS_POST_CLIENT_SECRET    ?? null,
  kundennummer:    process.env.SWISS_POST_KUNDENNUMMER     ?? null,
  frankiernummer:  process.env.SWISS_POST_FRANKIERNUMMER   ?? null,
  isMock: !process.env.SWISS_POST_CLIENT_ID,
}

if (SWISS_POST_CONFIG.isMock) {
  console.warn('[Swiss Post] Accès API non configurés — mode mock actif (shipping.service.js)')
}

module.exports = SWISS_POST_CONFIG
