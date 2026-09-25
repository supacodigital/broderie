/* Adresse postale suisse — règles de La Poste, partagées par tous les formulaires
   d'adresse (commande, compte client, fiche client de l'admin).

   - Longueurs : celles des champs de l'API Barcode (étiquettes) — nom, complément,
     rue et localité 35 caractères, numéro 10. Au-delà, l'étiquette tronquait
     l'adresse sans prévenir.
   - NPA : 4 chiffres, et surtout un NPA de domicile qui existe EN SUISSE, d'après
     le répertoire officiel des localités de swisstopo (data/swissLocalities.json,
     regénéré par scripts/update-swiss-localities.js). La boutique ne livre qu'en
     Suisse : le Liechtenstein (9485–9498), les NPA inexistants et ceux sans
     domicile (cases postales, 1200 Genève, 8000 Zürich…) sont refusés.
   Source : « Adressage correct », La Poste ; API Barcode (developer.post.ch). */
const SWISS_LOCALITIES = require('../data/swissLocalities.json');

const POSTAL_LIMITS = { name: 35, complement: 35, street: 35, streetNumber: 10, city: 35 };
const SWISS_ZIP_REGEX = /^[1-9]\d{3}$/;

const POSTAL_MESSAGES = {
  zip:          'NPA suisse invalide (4 chiffres, de 1000 à 9999).',
  zipUnknown:   'Ce NPA ne correspond à aucune adresse de livraison en Suisse.',
  name:         `${POSTAL_LIMITS.name} caractères au maximum (norme La Poste).`,
  complement:   `${POSTAL_LIMITS.complement} caractères au maximum (norme La Poste).`,
  street:       `${POSTAL_LIMITS.street} caractères au maximum (norme La Poste).`,
  streetNumber: `${POSTAL_LIMITS.streetNumber} caractères au maximum (norme La Poste).`,
  city:         `${POSTAL_LIMITS.city} caractères au maximum (norme La Poste).`,
};

// Localités desservies par un NPA : [{ city, canton }], vide si le NPA n'est pas suisse
const findLocalities = (zip) => (SWISS_LOCALITIES[String(zip ?? '').trim()] ?? [])
  .map(([city, canton]) => ({ city, canton }));

// NPA de domicile suisse : la seule destination livrée par la boutique
const isDeliverableZip = (zip) => findLocalities(zip).length > 0;

module.exports = { POSTAL_LIMITS, SWISS_ZIP_REGEX, POSTAL_MESSAGES, findLocalities, isDeliverableZip };
