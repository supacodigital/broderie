const { z } = require('zod');

const translationSchema = z.object({
  name:        z.string().min(1).max(255),
  description: z.string().max(10000).optional().nullable(),
  slug:        z.string().max(255).optional().nullable(),
});

const productCreateSchema = z.object({
  categoryId:      z.number().int().positive(),
  supplierId:      z.number().int().positive().optional().nullable(),
  slug:            z.string().min(1).max(255),
  priceChf:        z.number().positive().max(99999),
  comparePriceChf: z.number().positive().max(99999).optional().nullable(),
  taxRateId:       z.number().int().positive(),
  sku:             z.string().max(100).optional().nullable(),
  stock:           z.number().int().min(0).optional().default(0),
  weightKg:        z.number().positive().max(999).optional().nullable(),
  lengthCm:        z.number().positive().max(9999).optional().nullable(),
  widthCm:         z.number().positive().max(9999).optional().nullable(),
  isFeatured:      z.boolean().optional().default(false),
  isMadeToOrder:   z.boolean().optional().default(false),
  badge:           z.string().max(50).optional().nullable(),
  tagIds:          z.array(z.number().int().positive()).optional().default([]),
  translations: z.object({
    fr: translationSchema,
    de: translationSchema.optional(),
    en: translationSchema.optional(),
  }),
});

const productUpdateSchema = productCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const featuredOrderSchema = z.object({
  productIds: z.array(z.number().int().positive()).min(1).max(20),
});

module.exports = { productCreateSchema, productUpdateSchema, featuredOrderSchema };
