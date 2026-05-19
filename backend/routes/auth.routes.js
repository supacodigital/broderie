const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/auth.controller');

// Rate limiting renforcé sur les routes auth — désactivé hors production (dev + test)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
  message: { success: false, message: 'Trop de tentatives, veuillez réessayer dans 15 minutes.' },
});

router.post('/register',        authLimiter, authController.register);
router.post('/login',           authLimiter, authController.login);
router.post('/logout',          authController.logout);
router.post('/refresh-token',   authController.refreshToken);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password',  authLimiter, authController.resetPassword);
router.post('/google/verify',   authLimiter, authController.googleVerify);

module.exports = router;
