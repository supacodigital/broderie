/* Adresse postale suisse — règles de La Poste, partagées par tous les formulaires
   d'adresse (commande, compte client, fiche client de l'admin).

   - Longueurs : celles des champs de l'API Barcode (étiquettes) — nom, rue et
     localité 35 caractères, numéro 10. Au-delà, l'étiquette tronquait l'adresse
     sans prévenir.
   - NPA : 4 chiffres de 1000 à 9999 (les NPA suisses commencent à 1000 ; 0000 à
     0999 n'existent pas). Le Liechtenstein (9485–9498) reste dans la plage.
   Source : « Adressage correct », La Poste ; API Barcode (developer.post.ch). */
const POSTAL_LIMITS = { name: 35, street: 35, streetNumber: 10, city: 35 };
const SWISS_ZIP_REGEX = /^[1-9]\d{3}$/;

const POSTAL_MESSAGES = {
  zip:          'NPA suisse invalide (4 chiffres, de 1000 à 9999).',
  name:         `${POSTAL_LIMITS.name} caractères au maximum (norme La Poste).`,
  street:       `${POSTAL_LIMITS.street} caractères au maximum (norme La Poste).`,
  streetNumber: `${POSTAL_LIMITS.streetNumber} caractères au maximum (norme La Poste).`,
  city:         `${POSTAL_LIMITS.city} caractères au maximum (norme La Poste).`,
};

module.exports = { POSTAL_LIMITS, SWISS_ZIP_REGEX, POSTAL_MESSAGES };
