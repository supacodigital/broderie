/* Normes d'adressage La Poste — mêmes valeurs que backend/utils/postalAddress.utils.js.
   Au-delà, l'étiquette colis tronque le texte : la rue ou la localité deviennent illisibles. */
export const POSTAL_LIMITS = { name: 35, street: 35, streetNumber: 10, city: 35 }

// NPA suisse : 4 chiffres, de 1000 à 9999 (aucun NPA ne commence par 0)
export const SWISS_ZIP_REGEX = /^[1-9]\d{3}$/
