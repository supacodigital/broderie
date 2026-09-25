const { z } = require('zod');
const { nameField, phoneField, SWISS_CANTONS } = require('./user.validator');

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
  first_name:    optionalText(100),
  last_name:     optionalText(100),
  street:        requiredText('La rue est obligatoire.', 255),
  street_number: requiredText('Le numéro est obligatoire.', 20),
  zip:           z.string({ error: 'NPA suisse sur 4 chiffres.' }).trim().regex(/^\d{4}$/, 'NPA suisse sur 4 chiffres.'),
  city:          requiredText('La localité est obligatoire.', 100),
  canton:        z.enum(SWISS_CANTONS, { error: 'Canton obligatoire.' }),
  phone:         phoneField,
  // Seulement pour DEVENIR l'adresse par défaut — on ne retire pas ce statut
  // sans en désigner une autre
  is_default:    z.boolean().optional(),
});

module.exports = { adminUpdateCustomerSchema, adminAddressSchema };
