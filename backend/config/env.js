/* Centralisation de toutes les variables d'environnement.
   Règle CLAUDE.md : jamais process.env directement dans les controllers/services/middlewares. */
module.exports = {
  /* Auth JWT */
  jwtAccessSecret:     process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret:    process.env.JWT_REFRESH_SECRET,
  jwtAccessExpiresIn:  process.env.JWT_ACCESS_EXPIRES_IN  || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  /* MFA (TOTP) — admin
     jwtMfaPendingSecret : secret DÉDIÉ, distinct des secrets access/refresh — un token
     signé avec ce secret ne doit jamais pouvoir être accepté par le middleware requireAuth. */
  mfaEncryptionKey:       process.env.MFA_ENCRYPTION_KEY,
  jwtMfaPendingSecret:    process.env.JWT_MFA_PENDING_SECRET,
  jwtMfaPendingExpiresIn: process.env.JWT_MFA_PENDING_EXPIRES_IN || '5m',
  mfaRecoveryCodesCount:  parseInt(process.env.MFA_RECOVERY_CODES_COUNT || '10', 10),

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

  /* Swiss Post API (La Poste CH) — Digital Commerce API — renseignés quand le client fournit les accès.
     Tant que swissPostClientId est vide, le shipping tourne en mode mock (étiquettes simulées). */
  swissPostClientId:       process.env.SWISS_POST_CLIENT_ID       ?? null,
  swissPostClientSecret:   process.env.SWISS_POST_CLIENT_SECRET   ?? null,
  swissPostKundennummer:   process.env.SWISS_POST_KUNDENNUMMER    ?? null,  // numéro client du contrat envois
  swissPostFrankiernummer: process.env.SWISS_POST_FRANKIERNUMMER  ?? null,  // numéro d'affranchissement (frankingLicense)
  /* Endpoints officiels Digital Commerce API — surchargeables pour les tests/sandbox */
  swissPostTokenUrl:  process.env.SWISS_POST_TOKEN_URL  ?? 'https://api.post.ch/OAuth/token',
  swissPostLabelUrl:  process.env.SWISS_POST_LABEL_URL  ?? 'https://dcapi.apis.post.ch/barcode/v1/generateAddressLabel',
  swissPostScope:     process.env.SWISS_POST_SCOPE      ?? 'DCAPI_BARCODE_READ',
}
