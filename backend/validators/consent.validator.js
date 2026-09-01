const { z } = require('zod');

// `accepted` est le cœur de la preuve de consentement (accepté vs refusé)
const consentSchema = z.object({
  type:     z.enum(['cookies']).default('cookies'),
  accepted: z.boolean(),
  version:  z.string().min(1).max(20).default('1.0'),
});

module.exports = { consentSchema };
