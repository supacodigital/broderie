const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const userRepository       = require('../repositories/user.repository');
const orderRepository      = require('../repositories/order.repository');
const reviewRepository     = require('../repositories/review.repository');
const loyaltyRepository    = require('../repositories/loyalty.repository');
const wishlistRepository   = require('../repositories/wishlist.repository');
const newsletterRepository = require('../repositories/newsletter.repository');
const { AppError } = require('../middlewares/errorHandler');

// ─────────────────────────────────────────────────────────────
// Export des données personnelles (LPD art. 25 — droit d'accès)
// ─────────────────────────────────────────────────────────────
const exportUserData = async (userId) => {
  const profile = await userRepository.findByIdRaw(userId);
  if (!profile) throw new AppError('Compte introuvable.', 404);

  const [addresses, orders, reviews, loyaltyAccount, loyaltyRewards, loyaltyTransactions, wishlist, newsletter] =
    await Promise.all([
      userRepository.findAddresses(userId),
      orderRepository.findAllByUserIdWithItems(userId),
      reviewRepository.findByUserId(userId),
      loyaltyRepository.findAccount(userId),
      loyaltyRepository.findRewards(userId),
      loyaltyRepository.findTransactions(userId),
      wishlistRepository.findByUser(userId),
      newsletterRepository.findByEmail(profile.email),
    ]);

  // consent_logs — sans ip_hash (donnée technique, déjà pseudonymisée)
  const [consentLogs] = await pool.execute(
    `SELECT type, accepted, version, accepted_at FROM consent_logs WHERE user_id = ? ORDER BY accepted_at ASC`,
    [userId]
  );

  return {
    export_metadata: {
      generated_at: new Date().toISOString(),
      format_version: '1.0',
      legal_basis: "LPD art. 25 (droit d'accès)",
    },
    profile: {
      id: profile.id,
      email: profile.email,
      first_name: profile.first_name,
      last_name: profile.last_name,
      locale: profile.locale,
      role: profile.role,
      account_type: profile.google_id ? 'google' : 'password',
      avatar_url: profile.avatar_url,
      email_verified_at: profile.email_verified_at,
      created_at: profile.created_at,
    },
    addresses,
    orders,
    reviews,
    loyalty: {
      account: loyaltyAccount,
      rewards: loyaltyRewards,
      transactions: loyaltyTransactions,
    },
    wishlist: wishlist.map((w) => ({
      product_id: w.product_id,
      product_name: w.product_name,
      created_at: w.created_at,
    })),
    newsletter,
    consent_logs: consentLogs,
  };
};

// ─────────────────────────────────────────────────────────────
// Suppression de compte (LPD art. 32 al. 2 let. c) — anonymisation,
// pas de suppression physique (obligation comptable CO art. 958f)
// ─────────────────────────────────────────────────────────────
const deleteAccount = async (userId, { password, confirm } = {}) => {
  const account = await userRepository.findByIdWithPassword(userId);
  if (!account) throw new AppError('Compte introuvable.', 404);

  // Ré-authentification : mot de passe pour un compte classique, phrase de
  // confirmation explicite pour un compte Google (sans mot de passe).
  if (account.password_hash) {
    if (!password) throw new AppError('Mot de passe requis pour supprimer le compte.', 400);
    const ok = await bcrypt.compare(password, account.password_hash);
    if (!ok) throw new AppError('Mot de passe incorrect.', 401);
  } else if (confirm !== 'SUPPRIMER') {
    throw new AppError('Confirmation requise pour supprimer le compte.', 400);
  }

  // Un compte administrateur ne se supprime pas via cet endpoint self-service
  const full = await userRepository.findByIdRaw(userId);
  if (full?.role === 'admin' || full?.role === 'super_admin') {
    throw new AppError('Un compte administrateur ne peut pas être supprimé via cet endpoint.', 403);
  }

  const result = await userRepository.anonymizeUser(userId);
  if (result.notFound || result.alreadyDeleted) {
    throw new AppError('Compte introuvable.', 404);
  }

  // Désabonnement newsletter — best-effort, avec l'email d'origine
  if (result.email) {
    await newsletterRepository.unsubscribe(result.email).catch(() => {});
  }

  return { anonymizedAt: new Date() };
};

module.exports = { exportUserData, deleteAccount };
