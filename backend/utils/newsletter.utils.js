/* Désinscription newsletter en un clic — ticket CLI-05.

   La LCD suisse (art. 3 al. 1 let. o) impose que tout envoi commercial offre un
   moyen de refus SIMPLE et GRATUIT. Un lien qui redemanderait l'adresse, ou qui
   exigerait de se connecter, ne remplit pas cette condition : il faut qu'un clic
   depuis l'e-mail suffise.

   Mais un lien qui ne porterait que l'adresse permettrait de désabonner
   n'importe qui — il suffirait de deviner une adresse. Le lien porte donc une
   signature dérivée de l'adresse et d'un secret serveur : seul un destinataire
   ayant réellement reçu l'e-mail détient un jeton valide.

   Pas de table ni de colonne supplémentaire : la signature se recalcule à la
   volée. En contrepartie le jeton ne s'expire pas — c'est voulu, une newsletter
   reçue il y a deux ans doit rester désinscriptible. */

const crypto = require('crypto');
const env = require('../config/env');

/* Secret dédié, distinct de ceux des sessions : un jeton de désinscription
   circule en clair dans des e-mails et vit indéfiniment, il ne doit donc jamais
   partager le secret qui protège les connexions. */
const secretFor = () => `newsletter-unsubscribe:${env.jwtAccessSecret}`;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

/* Jeton de désinscription pour une adresse donnée.
   Tronqué à 32 caractères hexadécimaux (128 bits) : largement hors de portée
   d'une recherche exhaustive, et le lien reste lisible dans un e-mail. */
const buildUnsubscribeToken = (email) =>
  crypto.createHmac('sha256', secretFor())
    .update(normalizeEmail(email))
    .digest('hex')
    .slice(0, 32);

/* Vérifie un jeton reçu.
   Comparaison à temps constant : une comparaison ordinaire s'arrête au premier
   caractère différent et laisse mesurer où elle s'arrête, ce qui permettrait de
   reconstituer un jeton valide octet par octet. */
const verifyUnsubscribeToken = (email, token) => {
  const expected = buildUnsubscribeToken(email);
  const given = String(token || '');
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
};

/* URL de désinscription à placer dans les e-mails.
   L'adresse est encodée : elle contient un « @ » et peut contenir un « + ». */
const buildUnsubscribeUrl = (email) => {
  const base = String(env.clientUrl || '').replace(/\/+$/, '');
  const normalized = normalizeEmail(email);
  const token = buildUnsubscribeToken(normalized);
  return `${base}/desinscription?email=${encodeURIComponent(normalized)}&token=${token}`;
};

module.exports = {
  normalizeEmail,
  buildUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
};
