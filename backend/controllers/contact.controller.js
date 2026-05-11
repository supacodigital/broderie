const { z }        = require('zod');
const transporter  = require('../config/mailer');
const env          = require('../config/env');

const schema = z.object({
  name:    z.string().min(1).max(100),
  email:   z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
});

// Échappe les caractères HTML — obligatoire avant injection dans le corps d'un email HTML
const escapeHtml = (str) =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

const send = async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Données invalides.' });
    }

    const { name, email, subject, message } = parsed.data;

    const safeName    = escapeHtml(name);
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

    await transporter.sendMail({
      from:    `"${safeName}" <${env.mailFrom}>`,
      replyTo: email,
      to:      env.mailContact,
      subject: `[Contact] ${safeSubject}`,
      text:    `De : ${name} <${email}>\n\n${message}`,
      html:    `<p><strong>De :</strong> ${safeName} &lt;${escapeHtml(email)}&gt;</p><p>${safeMessage}</p>`,
    });

    res.json({ success: true, message: 'Message envoyé.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { send };
