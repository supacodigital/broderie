const { z } = require('zod');

// Validation de FORME des paliers de fidélité.
// Le plafond sur `rewardValue` est le garde-fou principal : un palier en pourcentage
// mal saisi (100) offrait la commande entière au client.
// Valeur retenue avec la cliente : les remises très élevées restent possibles, seule
// la gratuité totale est écartée.
const MAX_PERCENT = 90;

const tierShapeSchema = z
  .object({
    name:               z.string().trim().min(1, 'Le nom du palier est obligatoire.').max(60),
    minSpendChf:        z.coerce.number().positive('Le seuil doit être supérieur à 0.').max(100000),
    rewardType:         z.enum(['fixed', 'percent'], { message: 'Type de récompense invalide. Valeurs : fixed, percent.' }),
    rewardValue:        z.coerce.number().positive('La valeur de la récompense doit être supérieure à 0.'),
    rewardValidityDays: z.coerce.number().int().positive().max(3650).optional().nullable(),
    isActive:           z.coerce.boolean().optional(),
    sortOrder:          z.coerce.number().int().min(0).optional().nullable(),
  })
  // Une remise en pourcentage est bornée : à 100 %, la commande devient entièrement
  // gratuite, ce qui n'est jamais l'intention d'un programme de fidélité.
  .refine((t) => t.rewardType !== 'percent' || t.rewardValue <= MAX_PERCENT, {
    message: `Une remise en pourcentage ne peut pas dépasser ${MAX_PERCENT} %.`,
    path: ['rewardValue'],
  });

module.exports = { tierShapeSchema, MAX_PERCENT };
