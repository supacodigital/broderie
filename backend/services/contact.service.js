const { z } = require('zod');
const emailService = require('./email.service');
const { AppError } = require('../middlewares/errorHandler');

// name / subject : pas de retour ligne (anti-injection d'en-tête SMTP)
const contactSchema = z.object({
  name:    z.string().trim().min(1).max(100).regex(/^[^\r\n]+$/, 'Nom invalide.'),
  email:   z.string().email(),
  subject: z.string().trim().min(1).max(200).regex(/^[^\r\n]+$/, 'Objet invalide.'),
  message: z.string().trim().min(1).max(5000),
});

const send = async (body) => {
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('Données invalides.', 400);
  }
  await emailService.sendContactMessage(parsed.data);
};

module.exports = { send };
