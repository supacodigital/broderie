const { z } = require('zod');
const mfaService = require('../services/mfa.service');
const authService = require('../services/auth.service');
const userRepository = require('../repositories/user.repository');

const totpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Le code doit contenir 6 chiffres.'),
});

const recoveryCodeSchema = z.object({
  recoveryCode: z.string().min(1),
});

// Formate un utilisateur pour la réponse API — même forme que auth.controller.js
const toPublicUser = (user) => ({
  id: user.id,
  email: user.email,
  firstName: user.first_name,
  lastName: user.last_name,
  role: user.role,
  locale: user.locale,
  emailVerified: !!user.email_verified_at,
});

// Émet les tokens finaux + pose le cookie refresh — appelé à la fin des 3 flux
// (setup/confirm, verify, verify-recovery-code), jamais avant que la MFA soit validée.
const issueFinalTokens = async (res, userId) => {
  const user = await userRepository.findById(userId);
  const accessToken = authService.generateAccessToken(user);
  const refreshToken = authService.generateRefreshToken(user);
  res.cookie('refreshToken', refreshToken, authService.refreshCookieOptions());
  return { accessToken, user };
};

const setupInit = async (req, res, next) => {
  try {
    const { qrCodeDataUrl, manualEntryKey } = await mfaService.initSetup(req.mfaPendingUserId);
    res.json({ success: true, data: { qrCodeDataUrl, manualEntryKey } });
  } catch (error) {
    next(error);
  }
};

const setupConfirm = async (req, res, next) => {
  try {
    const parsed = totpCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Code invalide ou expiré.' });
    }

    const { recoveryCodes } = await mfaService.confirmSetup(req.mfaPendingUserId, parsed.data.code);
    const { accessToken, user } = await issueFinalTokens(res, req.mfaPendingUserId);

    res.json({ success: true, data: { accessToken, recoveryCodes, user: toPublicUser(user) } });
  } catch (error) {
    next(error);
  }
};

const verify = async (req, res, next) => {
  try {
    const parsed = totpCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(401).json({ success: false, message: 'Code invalide ou expiré.' });
    }

    await mfaService.verifyTotp(req.mfaPendingUserId, parsed.data.code);
    const { accessToken, user } = await issueFinalTokens(res, req.mfaPendingUserId);

    res.json({ success: true, data: { accessToken, user: toPublicUser(user) } });
  } catch (error) {
    next(error);
  }
};

const verifyRecoveryCode = async (req, res, next) => {
  try {
    const parsed = recoveryCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(401).json({ success: false, message: 'Code invalide ou expiré.' });
    }

    await mfaService.verifyRecoveryCode(req.mfaPendingUserId, parsed.data.recoveryCode);
    const { accessToken, user } = await issueFinalTokens(res, req.mfaPendingUserId);

    res.json({ success: true, data: { accessToken, user: toPublicUser(user) } });
  } catch (error) {
    next(error);
  }
};

const regenerateRecoveryCodes = async (req, res, next) => {
  try {
    const { recoveryCodes } = await mfaService.regenerateRecoveryCodes(req.user.id);
    res.json({ success: true, data: { recoveryCodes } });
  } catch (error) {
    next(error);
  }
};

const getStatus = async (req, res, next) => {
  try {
    const status = await mfaService.getStatus(req.user.id);
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
};

module.exports = { setupInit, setupConfirm, verify, verifyRecoveryCode, regenerateRecoveryCodes, getStatus };
