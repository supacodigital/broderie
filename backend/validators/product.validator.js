const { z } = require('zod');

const translationSchema = z.object({
  name:        z.string().min(1).max(255),
  description: z.string().max(10000).optional().nullable(),
  slug:        z.string().max(255).optional().nullable(),
});

const productBaseSchema = z.object({
  categoryId:      z.number().int().positive(),
  /* Rayons SECONDAIRES (ADM-04) — la catégorie principale reste `categoryId`.
     Champ absent = les rayons existants sont conservés ; tableau vide = la
     cliente a retiré tous les rayons secondaires. Plafonné pour qu'une saisie
     aberrante ne fasse pas gonfler la table de liaison. */
  secondaryCategoryIds: z.array(z.number().int().positive()).max(20).optional(),
  supplierId:      z.number().int().positive().optional().nullable(),
  slug:            z.string().min(1).max(255),
  priceChf:        z.number().positive().max(99999),
  comparePriceChf: z.number().positive().max(99999).optional().nullable(),
  /* Fenêtre de promotion — datetime ISO ou null (pas de borne de ce côté).
     Chaîne vide tolérée : un champ date vidé dans le formulaire admin arrive
     comme '' et doit être compris comme « pas de borne ». */
  promoStartsAt:   z.union([z.string().datetime({ offset: true }), z.literal('')]).optional().nullable(),
  promoEndsAt:     z.union([z.string().datetime({ offset: true }), z.literal('')]).optional().nullable(),
  taxRateId:       z.number().int().positive(),
  sku:             z.string().max(100).optional().nullable(),
  stock:           z.number().int().min(0).optional().default(0),
  weightKg:        z.number().positive().max(999).optional().nullable(),
  lengthCm:        z.number().positive().max(9999).optional().nullable(),
  widthCm:         z.number().positive().max(9999).optional().nullable(),
  isFeatured:      z.boolean().optional().default(false),
  isMadeToOrder:   z.boolean().optional().default(false),
  /* Vente à la coupe — trames et bandes à broder (ADM-12).
     Le pas descend à 1 cm et plafonne à 100 : au-delà, « à la coupe » perd son
     sens. Le minimum est borné à 10 m, une bande n'étant pas vendue au rouleau. */
  soldByLength:    z.boolean().optional().default(false),
  lengthStepCm:    z.number().int().min(1).max(100).optional().nullable(),
  lengthMinCm:     z.number().int().min(1).max(1000).optional().nullable(),
  badge:           z.string().max(50).optional().nullable(),
  brand:           z.string().max(120).optional().nullable(),
  translations: z.object({
    fr: translationSchema,
  }),
});

/* Cohérence de la fenêtre de promotion : une fin antérieure au début donnerait
   une promo jamais active, silencieusement. On refuse plutôt que d'accepter une
   saisie qui n'aurait aucun effet visible pour l'admin. */
const checkPromoWindow = (data, ctx) => {
  if (data.promoStartsAt && data.promoEndsAt) {
    if (new Date(data.promoEndsAt) <= new Date(data.promoStartsAt)) {
      ctx.addIssue({
        code: 'custom',
        path: ['promoEndsAt'],
        message: 'La fin de la promotion doit être postérieure à son début.',
      });
    }
  }
};

/* Cohérence de la vente à la coupe (ADM-12).
   Le minimum doit être un multiple du pas : avec un pas de 10 cm et un minimum
   de 55, la première longueur commandable serait 60 — l'admin afficherait 55 et
   la boutique en vendrait 60. On refuse plutôt que de laisser cet écart. */
const checkCutLength = (data, ctx) => {
  if (!data.soldByLength) return;
  const step = data.lengthStepCm ?? 10;
  const min  = data.lengthMinCm ?? 50;
  if (min % step !== 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['lengthMinCm'],
      message: `La longueur minimale doit être un multiple de ${step} cm.`,
    });
  }
  if (min < step) {
    ctx.addIssue({
      code: 'custom',
      path: ['lengthMinCm'],
      message: 'La longueur minimale ne peut pas être inférieure au pas de découpe.',
    });
  }
};

const checkProduct = (data, ctx) => {
  checkPromoWindow(data, ctx);
  checkCutLength(data, ctx);
};

/* superRefine renvoie un ZodEffects, sur lequel .partial() n'existe plus :
   on dérive donc les deux schémas du base object AVANT d'y attacher le contrôle. */
const productCreateSchema = productBaseSchema.superRefine(checkProduct);

const productUpdateSchema = productBaseSchema.partial().extend({
  isActive: z.boolean().optional(),
}).superRefine(checkProduct);

const featuredOrderSchema = z.object({
  productIds: z.array(z.number().int().positive()).min(1).max(20),
});

module.exports = { productCreateSchema, productUpdateSchema, featuredOrderSchema };
