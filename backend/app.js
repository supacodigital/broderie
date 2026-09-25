/* En production, charge .env.production s'il existe (sinon .env par défaut).
   En dev/test, comportement inchangé : charge .env. */
const path = require('path');
if (process.env.NODE_ENV === 'production') {
  require('dotenv').config({ path: path.join(__dirname, '.env.production') });
}
require('dotenv').config(); // complète les variables non déjà définies (ne les écrase pas)

/* Filet de sécurité indépendant de config/env : quand on démarre le serveur
   directement (`node app.js` — jamais le cas sous Jest, qui importe app via require),
   les secrets doivent être présents et non-placeholder, quel que soit NODE_ENV.
   Empêche un démarrage prod avec NODE_ENV forcé à 'test'. env.js fait la validation
   complète (formats, distinction, etc.) juste après. */
if (require.main === module) {
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'JWT_MFA_PENDING_SECRET', 'MFA_ENCRYPTION_KEY', 'CONSENT_IP_PEPPER', 'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
    if (!process.env[key] || /change_me|__GENERER__|__A_DEFINIR__/i.test(process.env[key])) {
      console.error(`[ERREUR DÉMARRAGE] ${key} manquant ou placeholder — le serveur ne démarre pas.`);
      process.exit(1);
    }
  }
}

/* Validation complète de l'environnement (schéma Zod) — fail-fast avec process.exit(1)
   si une variable manque, est mal formée ou est un secret faible/placeholder.
   Le simple require suffit : env.js valide au chargement. */
require('./config/env');

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
// 'path' est déjà requis en haut du fichier (chargement .env.production)

const { testConnection } = require('./config/db');
const { errorHandler, AppError } = require('./middlewares/errorHandler');

const app = express();

/* Paramètres d'URL toujours de simples chaînes : `?q=a&q=b` donnait un tableau,
   `?q[x]=1` un objet, et `.trim()` sur ces valeurs faisait planter la route en
   500 (constaté sur la recherche boutique, CLI-01). Aucune page n'envoie de
   liste dans l'URL : la première valeur l'emporte, les objets sont ignorés. */
app.set('query parser', (queryString) => {
  const out = {};
  for (const [key, value] of new URLSearchParams(queryString)) {
    if (!key.includes('[') && !(key in out)) out[key] = value;
  }
  return out;
});

// Derrière le reverse-proxy Nginx en production : faire confiance au 1er proxy pour que
// req.secure/req.protocol reflètent HTTPS → indispensable pour poser les cookies « Secure ».
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Sécurité des headers HTTP — CSP.
// - scriptSrc : Vite en build ne produit AUCUN script inline → pas de 'unsafe-inline'
//   ni 'unsafe-eval'.
// - styleSrc : garde 'unsafe-inline' pour les attributs style={{}} de React ;
//   fonts.googleapis.com pour la feuille de styles Google Fonts.
// - fontSrc : fonts.gstatic.com pour les fichiers de police servis par Google Fonts.
//   Depuis le 25.09, la boutique sert ses polices elle-même (frontend/src/fonts.css) ;
//   Google Fonts ne reste utilisé que par l'aperçu de la vitrine dans l'admin.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      // js.stripe.com : Stripe.js est chargé par le checkout (phase 2 carte/Twint).
      // Sans cette autorisation, la CSP bloque le script et les paiements échouent.
      scriptSrc:      ["'self'", "https://js.stripe.com"],
      styleSrc:       ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc:         ["'self'", "data:", "blob:"],
      // api.stripe.com : appels XHR de Stripe.js (tokenisation, confirmation)
      connectSrc:     ["'self'", "https://api.stripe.com"],
      fontSrc:        ["'self'", "data:", "https://fonts.gstatic.com"],
      // Stripe rend ses champs de carte dans des iframes servies par js.stripe.com
      frameSrc:       ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
      objectSrc:      ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));

// Compression gzip sur toutes les réponses
app.use(compression());

// CORS — origin exacte uniquement, pas de wildcard (voir CLAUDE.md section 3)
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.ADMIN_URL,
  /* En développement, le backend sert aussi les SPA sur son propre port */
  process.env.NODE_ENV === 'development' ? `http://localhost:${process.env.PORT || 3000}` : null,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // En développement, Vite peut prendre le port suivant si le port configuré est occupé.
    // On accepte localhost:PORT et localhost:PORT+1 pour CLIENT_URL et ADMIN_URL.
    if (process.env.NODE_ENV === 'development') {
      const devFallbacks = allowedOrigins.flatMap(o => {
        try {
          const u = new URL(o);
          if (u.hostname !== 'localhost') return [];
          const p = Number(u.port);
          return [`http://localhost:${p + 1}`];
        } catch { return []; }
      });
      if (devFallbacks.includes(origin)) return callback(null, true);
    }

    // 403 et non 500 : une origine refusée n'est pas une panne du serveur
    callback(new AppError('CORS non autorisé', 403));
  },
  credentials: true,
}));

// Webhook Stripe monté AVANT express.json() — signature vérifiée sur le corps brut
app.use('/api/v1/payments', require('./routes/payments.routes'));

// Parsing JSON, URL-encoded et cookies
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

/* Rate limiting global — garde-fou anti-abus, désactivé hors production.
 *
 * Mesuré sur la boutique : une page de catalogue déclenche 10 appels API
 * (bandeau, catégories, marques, produits, panier, favoris, compte…) et chaque
 * fiche produit 4 de plus. Une cliente qui parcourt le catalogue une demi-heure
 * atteignait donc l'ancienne limite de 1000, et se retrouvait devant une boutique
 * entièrement en erreur — toutes les routes tombant ensemble.
 *
 * La lecture est donc largement ouverte : elle ne coûte que du cache et des
 * SELECT indexés. L'écriture (commande, avis, inscription newsletter) garde une
 * limite serrée, car c'est là qu'un abus a un coût réel. L'authentification a
 * sa propre protection, bien plus stricte (routes/auth.routes.js, 10 / 15 min).
 *
 * Actif en production ET en staging (staging = copie exacte de la prod, CLAUDE.md §3).
 * Le rafraîchissement de token échappe aux DEUX limiteurs : c'est un POST, donc il
 * tomberait sinon dans le quota d'écriture, en concurrence avec les commandes et les
 * avis. Il est déclenché par le navigateur à l'expiration de l'access token, jamais
 * par la cliente : l'épuiser déconnecte quelqu'un au milieu de sa visite. Sa
 * protection propre est le refresh token lui-même, signé et en cookie httpOnly.
 */
const skipLimiter = (req) => !['production', 'staging'].includes(process.env.NODE_ENV)
  || req.path === '/v1/auth/refresh-token';

const limiterMessage = { success: false, message: 'Trop de requêtes, veuillez réessayer dans quelques minutes.' };

const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5000 : 50000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLimiter,
  message: limiterMessage,
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 300 : 10000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipLimiter,
  message: limiterMessage,
});

app.use('/api/', (req, res, next) => (
  req.method === 'GET' || req.method === 'HEAD'
    ? readLimiter(req, res, next)
    : writeLimiter(req, res, next)
));

// Fichiers statiques — images produit (développement uniquement)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Fichiers statiques — app admin (sous-chemin /admin)
const adminDist = path.join(__dirname, '../admin/dist');
app.use('/admin', express.static(adminDist));

// Fichiers statiques — boutique client (racine)
const clientDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(clientDist));

// Route de santé
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'API opérationnelle', env: process.env.NODE_ENV });
});

// Routes API
app.use('/api/v1/auth', require('./routes/auth.routes'));
app.use('/api/v1/mfa',  require('./routes/mfa.routes'));
app.use('/api/v1/products', require('./routes/products.routes'));
app.use('/api/v1/categories', require('./routes/categories.routes'));
app.use('/api/v1/cart', require('./routes/cart.routes'));
app.use('/api/v1/orders', require('./routes/orders.routes'));
app.use('/api/v1/coupons', require('./routes/coupons.routes'));
app.use('/api/v1/users', require('./routes/users.routes'));
app.use('/api/v1/admin', require('./routes/admin.routes'));
app.use('/api/v1/shipping', require('./routes/shipping.routes'));
app.use('/api/v1/loyalty', require('./routes/loyalty.routes'));
app.use('/api/v1/products/:id/reviews', require('./routes/reviews.routes'));
app.use('/api/v1/newsletter', require('./routes/newsletter.routes'));
app.use('/api/v1/legal',     require('./routes/legal.routes'));
app.use('/api/v1/consent',   require('./routes/consent.routes'));

// Avis approuvés récents — page d'accueil
const { getApproved } = require('./controllers/review.controller');
app.get('/api/v1/reviews', getApproved);

// SPA fallback — admin
app.get('/admin/*splat', (_req, res) => {
  res.sendFile(path.join(__dirname, '../admin/dist/index.html'));
});

// SPA fallback — boutique client
app.get('*splat', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Route 404 API
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Ressource introuvable.' });
});

// Gestion centralisée des erreurs — doit être en dernier
app.use(errorHandler);

// Démarrage du serveur
const PORT = process.env.PORT || 3000;

const ROUTES = [
  { path: '/api/v1/auth',              label: 'Auth'         },
  { path: '/api/v1/mfa',               label: 'MFA'          },
  { path: '/api/v1/products',          label: 'Produits'     },
  { path: '/api/v1/categories',        label: 'Catégories'   },
  { path: '/api/v1/cart',              label: 'Panier'       },
  { path: '/api/v1/orders',            label: 'Commandes'    },
  { path: '/api/v1/coupons',           label: 'Coupons'      },
  { path: '/api/v1/users',             label: 'Utilisateurs' },
  { path: '/api/v1/admin',             label: 'Admin'        },
  { path: '/api/v1/shipping',          label: 'Livraison'    },
  { path: '/api/v1/loyalty',           label: 'Fidélité'     },
  { path: '/api/v1/payments',          label: 'Paiements'    },
  { path: '/api/v1/reviews',           label: 'Avis'         },
  { path: '/api/v1/newsletter',        label: 'Newsletter'   },
  { path: '/api/v1/legal',             label: 'Légal'        },
  { path: '/api/v1/consent',           label: 'Consentement' },
];

const start = async () => {
  await testConnection();

  // Annulation des commandes carte / Twint restées impayées plus de 2 h (CLI-07)
  require('./services/unpaidOrder.service').startUnpaidOrderSweeper();

  app.listen(PORT, () => {
    const isDev = process.env.NODE_ENV === 'development';
    const line  = '─'.repeat(52);

    console.log(`\n┌${line}┐`);
    console.log(`│  🚀  BRODERIE — Serveur Express démarré${' '.repeat(12)}│`);
    console.log(`├${line}┤`);
    console.log(`│  Env          : ${(process.env.NODE_ENV || 'development').padEnd(34)}│`);
    console.log(`│  Port         : ${String(PORT).padEnd(34)}│`);
    console.log(`│  Health       : ${'http://localhost:' + PORT + '/health'.padEnd(34)}│`);
    if (isDev) {
      console.log(`│  Client       : ${(process.env.CLIENT_URL || '—').padEnd(34)}│`);
      console.log(`│  Admin        : ${(process.env.ADMIN_URL  || '—').padEnd(34)}│`);
    }
    console.log(`├${line}┤`);
    console.log(`│  Routes API montées :${' '.repeat(30)}│`);
    for (const r of ROUTES) {
      const label = `  ✓  ${r.label.padEnd(14)} ${r.path}`;
      console.log(`│${label.padEnd(52)}│`);
    }
    console.log(`└${line}┘\n`);
  });
};

/* Démarre le serveur uniquement si ce fichier est exécuté directement (pas importé par Jest) */
if (require.main === module) {
  start();
}

module.exports = app;
