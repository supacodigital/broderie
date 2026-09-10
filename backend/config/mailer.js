const nodemailer = require('nodemailer');
const env = require('./env');

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

// Service email en suspens (MAIL_ENABLED=false) : on ne se connecte à aucun SMTP.
// sendMail est remplacé par un stub qui journalise le destinataire + le sujet et
// résout normalement — aucun appelant n'a besoin d'être modifié, et rien ne casse
// si le fournisseur SMTP est indisponible.
if (!env.mailEnabled) {
  console.warn('[Mailer] Service email EN SUSPENS (MAIL_ENABLED=false) — aucun email ne sera envoyé.');
  transporter.sendMail = async (options = {}) => {
    console.info('[Mailer] Email non envoyé (service en suspens) →', {
      to: options.to,
      subject: options.subject,
    });
    return { accepted: [], rejected: [], messageId: 'suspended', suspended: true };
  };
} else if (process.env.NODE_ENV !== 'test') {
  // Vérification de la connexion SMTP au démarrage (non bloquant)
  transporter.verify().catch((err) => {
    console.error('[Mailer] Connexion SMTP échouée :', err.message);
  });
}

module.exports = transporter;
