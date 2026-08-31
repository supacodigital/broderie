const { z } = require('zod');

// Validation de FORME des champs catégorie (longueurs, formats) — la validation
// métier (slug obligatoire, unicité, hiérarchie) reste dans le controller.
// Objectif : borner les entrées d'un champ public non contraint et bloquer les
// URL d'image à schéma dangereux.

const imageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => v === '' || /^\/[\w\-./]*$/.test(v) || /^https?:\/\//i.test(v),
    { message: "URL d'image invalide (chemin relatif ou http(s) attendu)." }
  );

const nameSchema = z.string().trim().min(1).max(120);
const descriptionSchema = z.string().trim().max(2000);

// Schéma permissif : tous les champs optionnels, on ne valide que ce qui est présent.
const categoryShapeSchema = z.object({
  slug:      z.string().trim().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug invalide (minuscules, chiffres et tirets).').optional(),
  imageUrl:  imageUrlSchema.optional().nullable(),
  sortOrder: z.union([z.coerce.number().int().min(0), z.null()]).optional(),
  translations: z
    .object({
      fr: z.object({ name: nameSchema.optional(), description: descriptionSchema.optional() }).partial().optional(),
      de: z.object({ name: nameSchema.optional(), description: descriptionSchema.optional() }).partial().optional(),
      en: z.object({ name: nameSchema.optional(), description: descriptionSchema.optional() }).partial().optional(),
    })
    .optional(),
}).passthrough(); // parentId etc. laissés au controller

module.exports = { categoryShapeSchema, imageUrlSchema };
