const { z } = require('zod');

// Validation de forme des champs tag — la validation métier reste au controller.
const nameSchema = z.string().trim().min(1).max(60);

const tagShapeSchema = z.object({
  slug:      z.string().trim().max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug invalide (minuscules, chiffres et tirets).').optional(),
  sortOrder: z.union([z.coerce.number().int().min(0), z.null()]).optional(),
  translations: z
    .object({
      fr: z.object({ name: nameSchema.optional() }).partial().optional(),
      de: z.object({ name: nameSchema.optional() }).partial().optional(),
      en: z.object({ name: nameSchema.optional() }).partial().optional(),
    })
    .optional(),
}).passthrough();

module.exports = { tagShapeSchema };
