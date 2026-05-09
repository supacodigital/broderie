require('dotenv').config();

/* Validation des variables obligatoires au démarrage — fail-fast avant d'accepter du trafic */
const REQUIRED_ENV = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
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

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');

const { testConnection } = require('./config/db');
const { errorHandler } = require('./middlewares/errorHandler');

const app = express();

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
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS non autorisé'));
    }
  },
  credentials: true,
}));

// Webhook Stripe monté AVANT express.json() — signature vérifiée sur le corps brut
app.use('/api/v1/payments', require('./routes/payments.routes'));

// Parsing JSON, URL-encoded et cookies
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Rate limiting global — désactivé en développement pour éviter les blocages lors des tests
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 200 : 10000,
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
app.use('/api/v1/products', require('./routes/products.routes'));
app.use('/api/v1/categories', require('./routes/categories.routes'));
app.use('/api/v1/cart', require('./routes/cart.routes'));
app.use('/api/v1/orders', require('./routes/orders.routes'));
app.use('/api/v1/coupons', require('./routes/coupons.routes'));
app.use('/api/v1/users', require('./routes/users.routes'));
app.use('/api/v1/admin', require('./routes/admin.routes'));
app.use('/api/v1/loyalty', require('./routes/loyalty.routes'));
app.use('/api/v1/products/:id/reviews', require('./routes/reviews.routes'));
app.use('/api/v1/newsletter', require('./routes/newsletter.routes'));
app.use('/api/v1/legal',     require('./routes/legal.routes'));

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

const start = async () => {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT} [${process.env.NODE_ENV}]`);
  });
};

start();

module.exports = app;
