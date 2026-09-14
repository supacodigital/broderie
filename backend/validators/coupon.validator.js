const { z } = require('zod');

// Validation des codes promo administrables.
// Le point critique est la BORNE HAUTE de `value` : sans elle, un pourcentage
// supérieur à 100 produit une remise plus grande que le panier, donc un total
// négatif (voir coupon.repository.js::validate, qui calcule subtotal * value / 100).

const baseShape = {
  code:        z.string().trim().min(1, 'Le code est obligatoire.').max(50)
                 .regex(/^[A-Za-z0-9_-]+$/, 'Code invalide (lettres, chiffres, tiret et underscore).'),
  type:        z.enum(['fixed', 'percent'], { message: 'Type invalide. Valeurs : fixed, percent.' }),
  value:       z.coerce.number().positive('La valeur doit être positive.'),
  minOrderChf: z.coerce.number().min(0).max(100000).optional().nullable(),
  usageLimit:  z.coerce.number().int().min(1).max(1000000).optional().nullable(),
  expiresAt:   z.union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}([ T].*)?$/), z.null()]).optional(),
  isActive:    z.union([z.boolean(), z.coerce.number().int().min(0).max(1)]).optional(),
};

// Un pourcentage ne peut pas dépasser 100 % ; un montant fixe est borné à un
// plafond raisonnable pour éviter une faute de frappe à 6 chiffres.
const withValueBounds = (schema) => schema.superRefine((data, ctx) => {
  if (data.type === 'percent' && data.value > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'],
      message: 'Une remise en pourcentage ne peut pas dépasser 100 %.' });
  }
  if (data.type === 'fixed' && data.value > 10000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'],
      message: 'Une remise fixe ne peut pas dépasser CHF 10 000.' });
  }
});

const createCouponSchema = withValueBounds(z.object(baseShape));

// Mise à jour : mêmes règles, tous les champs optionnels — mais `type` et `value`
// doivent être fournis ensemble pour que la borne reste vérifiable.
const updateCouponSchema = z.object(
  Object.fromEntries(Object.entries(baseShape).map(([k, v]) => [k, v.optional()]))
).superRefine((data, ctx) => {
  if (data.value === undefined) return;
  if (data.type === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['type'],
      message: 'Le type doit être fourni avec la valeur.' });
    return;
  }
  if (data.type === 'percent' && data.value > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'],
      message: 'Une remise en pourcentage ne peut pas dépasser 100 %.' });
  }
  if (data.type === 'fixed' && data.value > 10000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'],
      message: 'Une remise fixe ne peut pas dépasser CHF 10 000.' });
  }
});

module.exports = { createCouponSchema, updateCouponSchema };
