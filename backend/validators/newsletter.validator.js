const { z } = require('zod');

const subscribeSchema = z.object({
  email:  z.string().trim().email('Adresse email invalide.').max(255),
  locale: z.literal('fr').optional().default('fr'),
});

/* La désinscription exige le jeton reçu par e-mail (CLI-05) : sans lui, connaître
   une adresse suffisait à désabonner son propriétaire. */
const unsubscribeSchema = z.object({
  email: z.string().trim().email('Adresse email invalide.').max(255),
  token: z.string().trim().length(32, 'Lien de désinscription invalide.'),
});

/* Confirmation d'inscription (double opt-in, CLI-05) : « <expiration>.<signature> »,
   vérifié ensuite par verifyConfirmToken. */
const confirmSchema = z.object({
  email: z.string().trim().email('Adresse email invalide.').max(255),
  token: z.string().trim().regex(/^\d{9,12}\.[0-9a-f]{32}$/, 'Lien de confirmation invalide.'),
});

module.exports = { subscribeSchema, unsubscribeSchema, confirmSchema };
