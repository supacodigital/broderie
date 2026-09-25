/* Client HTTP bas niveau pour la Digital Commerce API de La Poste CH.
   - Auth OAuth2 « client_credentials » avec mise en cache du token jusqu'à expiration.
   - Appel generateAddressLabel.
   Utilise le fetch natif de Node ≥ 18 — aucune dépendance ajoutée.

   Structure du corps : voir buildLabelPayload (shipping.service.js), calquée sur
   l'exemple officiel de developer.post.ch/en/digital-commerce-api. */

const swissPost = require('./swissPost');

/* Cache du token en mémoire process — partagé entre requêtes, renouvelé avant expiration */
let cachedToken = null;       // { value, expiresAt }
const TOKEN_SAFETY_MARGIN_MS = 60_000; // renouveler 60 s avant l'expiration réelle

/* Erreur HTTP de La Poste : le statut et le corps de la réponse restent
   accessibles (codes « E1234 » à afficher dans l'admin). Un corps vide est
   signalé tel quel — c'est le cas d'un JSON dont la structure est refusée. */
const postError = (label, status, detail) => {
  const error = new Error(`${label} : ${detail.slice(0, 300) || '(réponse vide)'}`);
  error.status = status;
  error.detail = detail;
  return error;
};

/**
 * Récupère un access token OAuth2 (client_credentials), depuis le cache si encore valide.
 * @returns {Promise<string>} le token Bearer
 */
const getAccessToken = async () => {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - TOKEN_SAFETY_MARGIN_MS > now) {
    return cachedToken.value;
  }

  /* Corps form-urlencoded — le client_secret ne doit JAMAIS passer en query string */
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     swissPost.clientId,
    client_secret: swissPost.clientSecret,
    scope:         swissPost.scope,
  });

  const res = await fetch(swissPost.tokenUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw postError(`OAuth2 La Poste CH a échoué (HTTP ${res.status})`, res.status, detail);
  }

  const json = await res.json();
  /* expires_in est en secondes ; on stocke un timestamp absolu */
  cachedToken = {
    value:     json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
};

/**
 * Appelle POST generateAddressLabel et retourne la réponse JSON brute de l'API.
 * @param {object} payload corps de la requête (frankingLicense, customer, labelDefinition, item)
 */
const generateAddressLabel = async (payload) => {
  const token = await getAccessToken();

  const res = await fetch(swissPost.labelUrl, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw postError(`generateAddressLabel La Poste CH a échoué (HTTP ${res.status})`, res.status, detail);
  }

  return res.json();
};

/* Réinitialise le cache du token — utile pour les tests */
const _resetTokenCache = () => { cachedToken = null; };

module.exports = { getAccessToken, generateAddressLabel, _resetTokenCache };
