/* Centralisation de toutes les variables d'environnement.
   Règle CLAUDE.md : jamais process.env directement dans les controllers/services/middlewares. */
module.exports = {
  /* Auth JWT */
  jwtAccessSecret:     process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret:    process.env.JWT_REFRESH_SECRET,
  jwtAccessExpiresIn:  process.env.JWT_ACCESS_EXPIRES_IN  || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  /* URLs */
  clientUrl: process.env.CLIENT_URL,
  adminUrl:  process.env.ADMIN_URL,

  /* Stripe */
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,

  /* Facture QR suisse — IBAN de test par défaut, à remplacer par le vrai IBAN de la cliente en production.
     IBAN normal (pas QR-IBAN) : permet une facture sans référence structurée obligatoire. */
  qrInvoiceIban:    process.env.QR_INVOICE_IBAN    ?? 'CH9300762011623852957',
  qrInvoiceName:    process.env.QR_INVOICE_NAME    ?? process.env.SHOP_NAME    ?? 'Au Point-Compté',
  qrInvoiceAddress: process.env.QR_INVOICE_ADDRESS ?? process.env.SHOP_ADDRESS ?? 'Rue de la Boutique 1',
  qrInvoiceZip:     process.env.QR_INVOICE_ZIP     ?? process.env.SHOP_ZIP     ?? '1200',
  qrInvoiceCity:    process.env.QR_INVOICE_CITY    ?? process.env.SHOP_CITY    ?? 'Genève',
  /* Délai de paiement de la facture (jours) */
  invoiceDueDays:   parseInt(process.env.INVOICE_DUE_DAYS || '30', 10),

  /* Click & Collect — adresse et horaires de l'unique boutique (retrait + paiement sur place) */
  pickupName:    process.env.PICKUP_NAME    ?? process.env.SHOP_NAME    ?? 'Au Point-Compté',
  pickupAddress: process.env.PICKUP_ADDRESS ?? process.env.SHOP_ADDRESS ?? 'Rue de la Boutique 1',
  pickupZip:     process.env.PICKUP_ZIP     ?? process.env.SHOP_ZIP     ?? '1200',
  pickupCity:    process.env.PICKUP_CITY    ?? process.env.SHOP_CITY    ?? 'Genève',
  pickupHours:   process.env.PICKUP_HOURS   ?? 'Lun–Ven 9h–18h, Sam 9h–16h',

  /* Google OAuth */
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? null,

  /* Emails */
  mailFrom:    process.env.MAIL_FROM,
  mailContact: process.env.MAIL_CONTACT ?? process.env.MAIL_FROM,

  /* Environnement */
  nodeEnv: process.env.NODE_ENV || 'development',
  port:    parseInt(process.env.PORT || '3000', 10),

  /* Informations boutique (expédition, emails) */
  shopName:    process.env.SHOP_NAME    ?? 'Au Point-Compté',
  shopPhone:   process.env.SHOP_PHONE   ?? '+41000000000',
  shopAddress: process.env.SHOP_ADDRESS ?? 'Rue de la Boutique 1',
  shopCity:    process.env.SHOP_CITY    ?? 'Genève',
  shopCanton:  process.env.SHOP_CANTON  ?? 'GE',
  shopZip:     process.env.SHOP_ZIP     ?? '1200',

  /* Swiss Post API (La Poste CH) — renseignés quand le client fournit les accès */
  swissPostClientId:       process.env.SWISS_POST_CLIENT_ID       ?? null,
  swissPostClientSecret:   process.env.SWISS_POST_CLIENT_SECRET   ?? null,
  swissPostKundennummer:   process.env.SWISS_POST_KUNDENNUMMER    ?? null,
  swissPostFrankiernummer: process.env.SWISS_POST_FRANKIERNUMMER  ?? null,
}
