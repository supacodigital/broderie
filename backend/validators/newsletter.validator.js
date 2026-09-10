const { z } = require('zod');

const subscribeSchema = z.object({
  email:  z.string().trim().email('Adresse email invalide.').max(255),
  locale: z.literal('fr').optional().default('fr'),
});

const unsubscribeSchema = z.object({
  email: z.string().trim().email('Adresse email invalide.').max(255),
});

module.exports = { subscribeSchema, unsubscribeSchema };
