const crypto = require('crypto');
const bcrypt = require('bcrypt');
const mfaRepository = require('../repositories/mfa.repository');
const userRepository = require('../repositories/user.repository');
const { encryptSecret, decryptSecret } = require('../utils/crypto.utils');
const { generateTotpSecret, generateOtpauthUri, generateQrCodeDataUrl, verifyTotpCode } = require('../utils/totp.utils');
const { AppError } = require('../middlewares/errorHandler');
const emailService = require('./email.service');
const env = require('../config/env');

const SALT_ROUNDS = 12;
const ISSUER = 'Au Point-Compté Admin';

// Génère un jeu de codes de récupération en clair, format lisible XXXX-XXXX
const generateRawRecoveryCodes = (count) => {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const part1 = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 4);
    const part2 = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 4);
    codes.push(`${part1}-${part2}`);
  }
  return codes;
};

// Hache et insère un jeu de codes de récupération, retourne les codes en clair (affichage unique)
const issueRecoveryCodes = async (userId) => {
  const rawCodes = generateRawRecoveryCodes(env.mfaRecoveryCodesCount);
  const hashes = await Promise.all(rawCodes.map((code) => bcrypt.hash(code, SALT_ROUNDS)));
  await mfaRepository.deleteRecoveryCodesByUserId(userId);
  await mfaRepository.insertRecoveryCodes(userId, hashes);
  return rawCodes;
};

// Vérifie qu'un compte n'est pas verrouillé suite à trop d'échecs consécutifs.
// Contrôlé AVANT toute tentative de vérification TOTP/recovery — protège même
// contre un attaquant qui ferait tourner plusieurs IP différentes.
const assertNotLocked = (mfaRow) => {
  if (mfaRow.locked_until && new Date(mfaRow.locked_until) > new Date()) {
    throw new AppError('Trop de tentatives échouées. Réessayez dans quelques minutes.', 401);
  }
};

// ── Setup initial (premier login admin sans MFA configurée) ──

const initSetup = async (userId) => {
  const user = await userRepository.findById(userId);
  if (!user) throw new AppError('Utilisateur introuvable.', 404);

  const secret = generateTotpSecret();
  const { ciphertext, iv, authTag } = encryptSecret(secret);
  await mfaRepository.upsertPendingSecret(userId, { ciphertext, iv, authTag });

  const otpauthUri = generateOtpauthUri(secret, user.email, ISSUER);
  const qrCodeDataUrl = await generateQrCodeDataUrl(otpauthUri);

  return { qrCodeDataUrl, manualEntryKey: secret };
};

const confirmSetup = async (userId, code) => {
  const mfaRow = await mfaRepository.findByUserId(userId);
  if (!mfaRow) throw new AppError('Aucune configuration MFA en cours. Recommencez le setup.', 400);

  const secret = decryptSecret({
    ciphertext: mfaRow.secret_encrypted,
    iv: mfaRow.secret_iv,
    authTag: mfaRow.secret_auth_tag,
  });

  const isValid = await verifyTotpCode(secret, code);
  if (!isValid) throw new AppError('Code invalide ou expiré.', 400);

  await mfaRepository.markEnabled(userId);
  const recoveryCodes = await issueRecoveryCodes(userId);

  return { recoveryCodes };
};

// ── Vérification au login normal (MFA déjà active) ──

const verifyTotp = async (userId, code) => {
  const mfaRow = await mfaRepository.findByUserId(userId);
  if (!mfaRow || !mfaRow.enabled_at) throw new AppError('Code invalide ou expiré.', 401);

  assertNotLocked(mfaRow);

  const secret = decryptSecret({
    ciphertext: mfaRow.secret_encrypted,
    iv: mfaRow.secret_iv,
    authTag: mfaRow.secret_auth_tag,
  });

  const isValid = await verifyTotpCode(secret, code);
  if (!isValid) {
    await mfaRepository.recordFailure(userId);
    throw new AppError('Code invalide ou expiré.', 401);
  }

  await mfaRepository.recordSuccess(userId);
};

const verifyRecoveryCode = async (userId, rawCode) => {
  const mfaRow = await mfaRepository.findByUserId(userId);
  if (!mfaRow || !mfaRow.enabled_at) throw new AppError('Code invalide ou expiré.', 401);

  assertNotLocked(mfaRow);

  const unusedCodes = await mfaRepository.findUnusedRecoveryCodes(userId);
  let matched = null;
  for (const candidate of unusedCodes) {
    if (await bcrypt.compare(rawCode, candidate.code_hash)) {
      matched = candidate;
      break;
    }
  }

  if (!matched) {
    await mfaRepository.recordFailure(userId);
    throw new AppError('Code invalide ou expiré.', 401);
  }

  await mfaRepository.markRecoveryCodeUsed(matched.id);
  await mfaRepository.recordSuccess(userId);

  // Alerte non bloquante si c'était le dernier code disponible
  const remaining = await mfaRepository.countUnusedRecoveryCodes(userId);
  if (remaining === 0) {
    const user = await userRepository.findById(userId);
    emailService.sendMfaRecoveryCodesLow(user).catch((err) => {
      console.error('[Email] Alerte codes de récupération épuisés non envoyée :', err.message);
    });
  }
};

// ── Régénération (utilisateur pleinement authentifié) ──

const regenerateRecoveryCodes = async (userId) => {
  const mfaRow = await mfaRepository.findByUserId(userId);
  if (!mfaRow || !mfaRow.enabled_at) throw new AppError('MFA non activée sur ce compte.', 400);

  const recoveryCodes = await issueRecoveryCodes(userId);

  const user = await userRepository.findById(userId);
  emailService.sendMfaRecoveryCodesRegenerated(user).catch((err) => {
    console.error('[Email] Confirmation régénération codes non envoyée :', err.message);
  });

  return { recoveryCodes };
};

// ── Statut (page Sécurité) ──

const getStatus = async (userId) => {
  const mfaRow = await mfaRepository.findByUserId(userId);
  const enabled = !!mfaRow?.enabled_at;
  const recoveryCodesRemaining = enabled ? await mfaRepository.countUnusedRecoveryCodes(userId) : 0;
  return { enabled, recoveryCodesRemaining };
};

module.exports = {
  initSetup, confirmSetup,
  verifyTotp, verifyRecoveryCode,
  regenerateRecoveryCodes, getStatus,
};
