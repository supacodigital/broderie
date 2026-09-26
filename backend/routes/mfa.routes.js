const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const mfaController = require('../controllers/mfa.controller');
const { requireAuth } = require('../middlewares/auth');
const { requireRole, ADMIN_ROLES } = require('../middlewares/roles');
const { requireMfaPending } = require('../middlewares/mfaPending');

// Rate limiting renforcé sur la vérification de code — cible directe du brute-force
// (plus strict que authLimiter). Désactivé hors production, cohérent avec l'existant.
const mfaVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Actif en production ET en staging (staging = copie exacte de la prod, CLAUDE.md §3)
  skip: () => !['production', 'staging'].includes(process.env.NODE_ENV),
  message: { success: false, message: 'Trop de tentatives, veuillez réessayer dans 15 minutes.' },
});

const mfaSetupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Actif en production ET en staging (staging = copie exacte de la prod, CLAUDE.md §3)
  skip: () => !['production', 'staging'].includes(process.env.NODE_ENV),
  message: { success: false, message: 'Trop de tentatives, veuillez réessayer dans 15 minutes.' },
});

// Setup initial (premier login sans MFA configurée) — protégé par le token intermédiaire
router.post('/setup/init',    mfaSetupLimiter,  requireMfaPending, mfaController.setupInit);
router.post('/setup/confirm', mfaVerifyLimiter, requireMfaPending, mfaController.setupConfirm);

// Vérification au login normal (MFA déjà active)
router.post('/verify',               mfaVerifyLimiter, requireMfaPending, mfaController.verify);
router.post('/verify-recovery-code', mfaVerifyLimiter, requireMfaPending, mfaController.verifyRecoveryCode);

// Régénération et statut — session pleinement authentifiée, comptes du back-office
// (le super-administrateur gère aussi sa propre double authentification)
router.post('/recovery-codes/regenerate', requireAuth, requireRole(...ADMIN_ROLES), mfaController.regenerateRecoveryCodes);
router.get('/status',                     requireAuth, requireRole(...ADMIN_ROLES), mfaController.getStatus);

module.exports = router;
