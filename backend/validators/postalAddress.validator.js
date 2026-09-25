const { z } = require('zod');
const {
  POSTAL_LIMITS, SWISS_ZIP_REGEX, POSTAL_MESSAGES, isDeliverableZip,
} = require('../utils/postalAddress.utils');

/* Champs d'adresse postale communs aux schémas de commande, du compte client et
   de l'admin (règles : utils/postalAddress.utils.js). */

// NPA : format d'abord (un seul message), puis existence d'un domicile en Suisse
const swissZipField = () => z
  .string({ error: POSTAL_MESSAGES.zip })
  .trim()
  .regex(SWISS_ZIP_REGEX, { message: POSTAL_MESSAGES.zip, abort: true })
  .refine(isDeliverableZip, POSTAL_MESSAGES.zipUnknown);

// Complément (c/o, bâtiment, appartement) : facultatif, chaîne vide = aucun
const complementField = () => z
  .string()
  .trim()
  .max(POSTAL_LIMITS.complement, POSTAL_MESSAGES.complement)
  .optional()
  .nullable()
  .transform((value) => value || null);

module.exports = { swissZipField, complementField };
