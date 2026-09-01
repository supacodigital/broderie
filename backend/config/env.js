/* Centralisation + validation de toutes les variables d'environnement.
   Règle CLAUDE.md : jamais process.env directement dans les controllers/services/middlewares.
   La validation (schéma Zod) remplace le check impératif qui vivait dans app.js :
   secrets forts et distincts, formats, valeurs par défaut. Échec = process.exit(1). */
const { z } = require('zod');

const PLACEHOLDER = /change_me|__GENERER__|__A_DEFINIR__/i;

// Secret « fort » : ≥ 32 caractères, pas une valeur placeholder
const strongSecret = (label) => z.string()
  .min(32, `${label} doit faire au moins 32 caractères`)
  .refine((v) => !PLACEHOLDER.test(v), `${label} ne doit pas être une valeur placeholder`);

const TEST_IBAN = 'CH9300762011623852957';

const baseSchema = z.object({
  // ── Auth JWT ──
  JWT_ACCESS_SECRET:      strongSecret('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET:     strongSecret('JWT_REFRESH_SECRET'),
  JWT_ACCESS_EXPIRES_IN:  z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // ── MFA (TOTP) admin ──
  MFA_ENCRYPTION_KEY:       z.string().regex(/^[0-9a-fA-F]{64}$/, 'MFA_ENCRYPTION_KEY doit être 64 caractères hexadécimaux (32 bytes)'),
  JWT_MFA_PENDING_SECRET:   strongSecret('JWT_MFA_PENDING_SECRET'),
  JWT_MFA_PENDING_EXPIRES_IN: z.string().default('5m'),
  MFA_RECOVERY_CODES_COUNT:  z.coerce.number().int().positive().default(10),

  // ── LPD ──
  CONSENT_IP_PEPPER: strongSecret('CONSENT_IP_PEPPER'),

  // ── Base de données ──
  DB_HOST:     z.string().min(1),
  DB_PORT:     z.coerce.number().int().positive().default(3306),
  DB_NAME:     z.string().min(1),
  DB_USER:     z.string().min(1),
  DB_PASSWORD: z.string().min(1),

  // ── URLs ──
  CLIENT_URL: z.string().url().optional(),
  ADMIN_URL:  z.string().url().optional(),

  // ── Stripe ──
  STRIPE_SECRET_KEY:     z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // ── Facture QR ──
  QR_INVOICE_IBAN:       z.string().default(TEST_IBAN),
  QR_INVOICE_NAME:       z.string().optional(),
  QR_INVOICE_ADDRESS:    z.string().optional(),
  QR_INVOICE_ZIP:        z.string().optional(),
  QR_INVOICE_CITY:       z.string().optional(),
  QR_INVOICE_VAT_NUMBER: z.string().optional(),
  INVOICE_DUE_DAYS:      z.coerce.number().int().positive().default(30),

  // ── Click & Collect ──
  PICKUP_NAME:    z.string().optional(),
  PICKUP_ADDRESS: z.string().optional(),
  PICKUP_ZIP:     z.string().optional(),
  PICKUP_CITY:    z.string().optional(),
  PICKUP_HOURS:   z.string().default('Lun–Ven 9h–18h, Sam 9h–16h'),

  // ── Google OAuth ──
  GOOGLE_CLIENT_ID: z.string().optional(),

  // ── Emails ──
  MAIL_FROM:    z.string().optional(),
  MAIL_CONTACT: z.string().optional(),

  // ── Environnement ──
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT:     z.coerce.number().int().positive().default(3000),

  // ── Informations boutique ──
  SHOP_NAME:    z.string().default('Au Point-Compté'),
  SHOP_PHONE:   z.string().default('+41000000000'),
  SHOP_ADDRESS: z.string().default('Rue de la Boutique 1'),
  SHOP_CITY:    z.string().default('Genève'),
  SHOP_CANTON:  z.string().default('GE'),
  SHOP_ZIP:     z.string().default('1200'),

  // ── Swiss Post API ──
  SWISS_POST_CLIENT_ID:       z.string().optional(),
  SWISS_POST_CLIENT_SECRET:   z.string().optional(),
  SWISS_POST_KUNDENNUMMER:    z.string().optional(),
  SWISS_POST_FRANKIERNUMMER:  z.string().optional(),
  SWISS_POST_TOKEN_URL:  z.string().url().default('https://api.post.ch/OAuth/token'),
  SWISS_POST_LABEL_URL:  z.string().url().default('https://dcapi.apis.post.ch/barcode/v1/generateAddressLabel'),
  SWISS_POST_SCOPE:      z.string().default('DCAPI_BARCODE_READ'),
});

const schema = baseSchema
  // Les trois secrets JWT doivent être distincts (mfaPending.js en dépend)
  .refine(
    (v) => new Set([v.JWT_ACCESS_SECRET, v.JWT_REFRESH_SECRET, v.JWT_MFA_PENDING_SECRET]).size === 3,
    { message: 'JWT_ACCESS_SECRET, JWT_REFRESH_SECRET et JWT_MFA_PENDING_SECRET doivent être distincts' }
  )
  // En production, l'IBAN de facturation ne doit pas rester l'IBAN de test
  .refine(
    (v) => v.NODE_ENV !== 'production' || v.QR_INVOICE_IBAN !== TEST_IBAN,
    { message: 'QR_INVOICE_IBAN est encore l\'IBAN de test — configurer le vrai IBAN en production' }
  );

// Le mode « indulgent » (parse partiel, pas de secrets exigés) sert UNIQUEMENT à
// ne pas faire échouer le chargement d'un module qui require env transitivement
// depuis la suite de tests. Il n'est actif que si NODE_ENV vaut littéralement 'test'
// ET que Jest tourne (JEST_WORKER_ID) — jamais en staging/production, où la
// validation stricte + process.exit(1) s'appliquent toujours.
const NODE_ENV = process.env.NODE_ENV;
const isJestTest = NODE_ENV === 'test' && process.env.JEST_WORKER_ID !== undefined;

let e;
if (isJestTest) {
  e = baseSchema.partial().safeParse(process.env).data ?? {};
} else {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('[ERREUR DÉMARRAGE] Configuration d\'environnement invalide :');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.') || '(global)'} : ${issue.message}`);
    }
    process.exit(1);
  }
  e = parsed.data;
}

module.exports = {
  /* Auth JWT */
  jwtAccessSecret:     e.JWT_ACCESS_SECRET,
  jwtRefreshSecret:    e.JWT_REFRESH_SECRET,
  jwtAccessExpiresIn:  e.JWT_ACCESS_EXPIRES_IN,
  jwtRefreshExpiresIn: e.JWT_REFRESH_EXPIRES_IN,

  /* MFA (TOTP) — admin */
  mfaEncryptionKey:       e.MFA_ENCRYPTION_KEY,
  jwtMfaPendingSecret:    e.JWT_MFA_PENDING_SECRET,
  jwtMfaPendingExpiresIn: e.JWT_MFA_PENDING_EXPIRES_IN,
  mfaRecoveryCodesCount:  e.MFA_RECOVERY_CODES_COUNT,

  /* LPD — poivre HMAC des IP de consentement */
  consentIpPepper: e.CONSENT_IP_PEPPER,

  /* Base de données (les valeurs par défaut couvrent le contexte de test où les
     variables ne sont pas toutes présentes ; en prod le schéma les a déjà exigées) */
  db: {
    host:     e.DB_HOST ?? '127.0.0.1',
    port:     e.DB_PORT ?? 3306,
    name:     e.DB_NAME ?? 'broderie',
    user:     e.DB_USER ?? 'root',
    password: e.DB_PASSWORD ?? '',
  },

  /* URLs */
  clientUrl: e.CLIENT_URL,
  adminUrl:  e.ADMIN_URL,

  /* Stripe */
  stripeWebhookSecret: e.STRIPE_WEBHOOK_SECRET,

  /* Facture QR suisse */
  qrInvoiceIban:      e.QR_INVOICE_IBAN,
  qrInvoiceName:      e.QR_INVOICE_NAME    ?? e.SHOP_NAME,
  qrInvoiceAddress:   e.QR_INVOICE_ADDRESS ?? e.SHOP_ADDRESS,
  qrInvoiceZip:       e.QR_INVOICE_ZIP     ?? e.SHOP_ZIP,
  qrInvoiceCity:      e.QR_INVOICE_CITY    ?? e.SHOP_CITY,
  qrInvoiceVatNumber: e.QR_INVOICE_VAT_NUMBER ?? null,
  invoiceDueDays:     e.INVOICE_DUE_DAYS,

  /* Click & Collect */
  pickupName:    e.PICKUP_NAME    ?? e.SHOP_NAME,
  pickupAddress: e.PICKUP_ADDRESS ?? e.SHOP_ADDRESS,
  pickupZip:     e.PICKUP_ZIP     ?? e.SHOP_ZIP,
  pickupCity:    e.PICKUP_CITY    ?? e.SHOP_CITY,
  pickupHours:   e.PICKUP_HOURS,

  /* Google OAuth */
  googleClientId: e.GOOGLE_CLIENT_ID ?? null,

  /* Emails */
  mailFrom:    e.MAIL_FROM,
  mailContact: e.MAIL_CONTACT ?? e.MAIL_FROM,

  /* Environnement */
  nodeEnv: e.NODE_ENV,
  port:    e.PORT,

  /* Informations boutique */
  shopName:    e.SHOP_NAME,
  shopPhone:   e.SHOP_PHONE,
  shopAddress: e.SHOP_ADDRESS,
  shopCity:    e.SHOP_CITY,
  shopCanton:  e.SHOP_CANTON,
  shopZip:     e.SHOP_ZIP,

  /* Swiss Post API */
  swissPostClientId:       e.SWISS_POST_CLIENT_ID       ?? null,
  swissPostClientSecret:   e.SWISS_POST_CLIENT_SECRET   ?? null,
  swissPostKundennummer:   e.SWISS_POST_KUNDENNUMMER    ?? null,
  swissPostFrankiernummer: e.SWISS_POST_FRANKIERNUMMER  ?? null,
  swissPostTokenUrl:  e.SWISS_POST_TOKEN_URL,
  swissPostLabelUrl:  e.SWISS_POST_LABEL_URL,
  swissPostScope:     e.SWISS_POST_SCOPE,
};
