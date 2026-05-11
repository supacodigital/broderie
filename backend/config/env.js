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
