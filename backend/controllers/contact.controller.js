const { z }       = require('zod');
const transporter  = require('../config/mailer');

const schema = z.object({
  name:    z.string().min(1).max(100),
  email:   z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
});

const send = async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Données invalides.' });
    }

    const { name, email, subject, message } = parsed.data;

    await transporter.sendMail({
      from:    `"${name}" <${process.env.MAIL_FROM}>`,
      replyTo: email,
      to:      process.env.MAIL_CONTACT ?? process.env.MAIL_FROM,
      subject: `[Contact] ${subject}`,
      text:    `De : ${name} <${email}>\n\n${message}`,
      html:    `<p><strong>De :</strong> ${name} &lt;${email}&gt;</p><p>${message.replace(/\n/g, '<br>')}</p>`,
    });

    res.json({ success: true, message: 'Message envoyé.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { send };
