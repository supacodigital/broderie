const nodemailer = require('nodemailer');

// Transporter Nodemailer — SMTP Infomaniak Mail
const transporter = nodemailer.createTransport({
  host:   process.env.MAIL_HOST,
  port:   Number(process.env.MAIL_PORT) || 587,
  secure: false, // STARTTLS sur le port 587
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASSWORD,
  },
  // Timeout généreux pour éviter les blocages silencieux
  connectionTimeout: 10000,
  greetingTimeout:   5000,
});

// Vérification de la connexion SMTP au démarrage (non bloquant)
if (process.env.NODE_ENV !== 'test') {
  transporter.verify().catch((err) => {
    console.error('[Mailer] Connexion SMTP échouée :', err.message);
  });
}

module.exports = transporter;
