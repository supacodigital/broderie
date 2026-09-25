const { z } = require('zod');
const { nameField, phoneField, SWISS_CANTONS } = require('./user.validator');
const { POSTAL_LIMITS, SWISS_ZIP_REGEX, POSTAL_MESSAGES } = require('../utils/postalAddress.utils');

/* Fiche client modifiée depuis l'admin (CLI-06) : prénom, nom ET adresse
   e-mail — la cliente ne peut pas changer son adresse elle-même, la boutique
   le fait à sa demande. */
const adminUpdateCustomerSchema = z.object({
  first_name: nameField('Le prénom'),
  last_name:  nameField('Le nom'),
  email: z
    .string({ error: "L'adresse e-mail est obligatoire." })
    .trim()
    .min(1, "L'adresse e-mail est obligatoire.")
    .max(255, "L'adresse e-mail ne peut pas dépasser 255 caractères.")
    .email('Adresse e-mail invalide.'),
});

const requiredText = (message, max) => z
  .string({ error: message })
  .trim()
  .min(1, message)
  .max(max, `${max} caractères au maximum.`);

const optionalText = (max) => z
  .string()
  .trim()
  .max(max, `${max} caractères au maximum.`)
  .optional()
  .nullable();

/* Adresse d'une cliente saisie par la boutique — mêmes champs obligatoires que
   le formulaire « Mes adresses » du compte client. */
const adminAddressSchema = z.object({
  label:         requiredText('Le libellé est obligatoire.', 100),
  address_type:  z.enum(['shipping', 'billing', 'both'], { error: "Type d'adresse invalide." }).default('both'),
  // Longueurs et NPA aux normes La Poste (utils/postalAddress.utils.js)
  first_name:    optionalText(POSTAL_LIMITS.name),
  last_name:     optionalText(POSTAL_LIMITS.name),
  street:        requiredText('La rue est obligatoire.', POSTAL_LIMITS.street),
  street_number: requiredText('Le numéro est obligatoire.', POSTAL_LIMITS.streetNumber),
  zip:           z.string({ error: POSTAL_MESSAGES.zip }).trim().regex(SWISS_ZIP_REGEX, POSTAL_MESSAGES.zip),
  city:          requiredText('La localité est obligatoire.', POSTAL_LIMITS.city),
  canton:        z.enum(SWISS_CANTONS, { error: 'Canton obligatoire.' }),
  phone:         phoneField,
  // Seulement pour DEVENIR l'adresse par défaut — on ne retire pas ce statut
  // sans en désigner une autre
  is_default:    z.boolean().optional(),
});

module.exports = { adminUpdateCustomerSchema, adminAddressSchema };
