const { z } = require('zod');

/* Retour d'un paiement par QR Twint reçu par e-mail : Stripe ajoute à l'adresse
   de retour l'identifiant du paiement et son secret (« pi_…_secret_… »). */
const qrReturnSchema = z.object({
  payment_intent: z.string().trim().max(255).regex(/^pi_[A-Za-z0-9]+$/, 'Lien de paiement invalide.'),
  client_secret:  z.string().trim().max(255).regex(/^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/, 'Lien de paiement invalide.'),
});

module.exports = { qrReturnSchema };
