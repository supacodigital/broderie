/* En production, charge .env.production s'il existe (sinon .env par défaut).
   En dev/test, comportement inchangé : charge .env. */
const path = require('path');
if (process.env.NODE_ENV === 'production') {
  require('dotenv').config({ path: path.join(__dirname, '.env.production') });
}
require('dotenv').config(); // complète les variables non déjà définies (ne les écrase pas)

/* Validation des variables obligatoires au démarrage — fail-fast avant d'accepter du trafic */
const REQUIRED_ENV = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_MFA_PENDING_SECRET',
  'MFA_ENCRYPTION_KEY',
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  console.error(`[ERREUR DÉMARRAGE] Variables d'environnement manquantes : ${missingEnv.join(', ')}`);
  process.exit(1);
}

/* MFA_ENCRYPTION_KEY doit faire exactement 32 bytes (64 caractères hex) pour AES-256-GCM —
   échec explicite au démarrage plutôt qu'une erreur de chiffrement silencieuse en production. */
if (!/^[0-9a-fA-F]{64}$/.test(process.env.MFA_ENCRYPTION_KEY)) {
  console.error('[ERREUR DÉMARRAGE] MFA_ENCRYPTION_KEY doit être une chaîne hexadécimale de 64 caractères (32 bytes). Générer avec : node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
// 'path' est déjà requis en haut du fichier (chargement .env.production)

const { testConnection } = require('./config/db');
const { errorHandler } = require('./middlewares/errorHandler');

const app = express();

// Derrière le reverse-proxy Nginx en production : faire confiance au 1er proxy pour que
// req.secure/req.protocol reflètent HTTPS → indispensable pour poser les cookies « Secure ».
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Sécurité des headers HTTP — CSP assouplie pour les SPA (scripts/styles hachés par Vite)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc:       ["'self'", "'unsafe-inline'"],
      imgSrc:         ["'self'", "data:", "blob:"],
      connectSrc:     ["'self'"],
      fontSrc:        ["'self'", "data:"],
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

    callback(new Error('CORS non autorisé'));
  },
  credentials: true,
}));

// Webhook Stripe monté AVANT express.json() — signature vérifiée sur le corps brut
app.use('/api/v1/payments', require('./routes/payments.routes'));

// Parsing JSON, URL-encoded et cookies
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Rate limiting global — simple garde-fou anti-abus (large), désactivé hors production.
// La navigation client (catalogue, fiches, panier, avis) génère beaucoup d'appels légitimes :
// la limite doit rester confortable. La vraie protection stricte est sur les routes auth
// (voir routes/auth.routes.js, max 10/15min) — pas ici.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 1000 : 10000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
  message: { success: false, message: 'Trop de requêtes, veuillez réessayer plus tard.' },
});
app.use('/api/', globalLimiter);

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
app.use('/api/v1/tags', require('./routes/tags.routes'));
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
app.use('/api/v1/contact',   require('./routes/contact.routes'));
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
  { path: '/api/v1/tags',              label: 'Tags'         },
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
  { path: '/api/v1/contact',           label: 'Contact'      },
  { path: '/api/v1/consent',           label: 'Consentement' },
];

const start = async () => {
  await testConnection();

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
