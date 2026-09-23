const { z } = require('zod');

// Validation du profil client (PUT /users/me) — ticket CLI-06.
// La route n'avait aucune validation : un prénom vide ou de plusieurs milliers
// de caractères était enregistré tel quel.

const nameField = (label) => z
  .string({ error: `${label} est obligatoire.` })
  .trim()
  .min(1, `${label} est obligatoire.`)
  .max(100, `${label} ne peut pas dépasser 100 caractères.`);

/* Le frontend envoie first_name / last_name ; firstName / lastName restent
   acceptés pour les anciens appels. Les deux formes sont ramenées au
   snake_case AVANT validation, pour que les erreurs portent le nom du champ
   du formulaire. L'adresse e-mail éventuellement envoyée est ignorée : elle
   ne se modifie pas par cette route. */
const updateProfileSchema = z.preprocess(
  (body) => ({
    first_name: body?.first_name ?? body?.firstName,
    last_name:  body?.last_name  ?? body?.lastName,
  }),
  z.object({
    first_name: nameField('Le prénom'),
    last_name:  nameField('Le nom'),
  })
);

/* Téléphone d'une adresse — facultatif. Chiffres, espaces et + ( ) . / -
   uniquement : suffisant pour tous les formats suisses et étrangers. */
const phoneField = z
  .string()
  .trim()
  .max(30, 'Le numéro de téléphone ne peut pas dépasser 30 caractères.')
  .regex(/^[+0-9 ()./-]*$/, 'Numéro de téléphone invalide.')
  .optional()
  .nullable();

// Choix « Newsletter : Oui / Non » depuis le compte (CLI-05)
const newsletterPreferenceSchema = z.object({
  subscribed: z.boolean({ error: 'Choisissez « Oui » ou « Non ».' }),
});

module.exports = { updateProfileSchema, phoneField, newsletterPreferenceSchema };
