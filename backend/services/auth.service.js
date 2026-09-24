const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/user.repository');
const newsletterRepository = require('../repositories/newsletter.repository');
const mfaRepository = require('../repositories/mfa.repository');
const { AppError } = require('../middlewares/errorHandler');
const emailService = require('./email.service');
const env = require('../config/env');
const { isAdminRole } = require('../middlewares/roles');

const SALT_ROUNDS = 12;

// Génération d'un access token JWT (courte durée — stocké en mémoire React)
const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user.id, role: user.role, locale: user.locale },
    env.jwtAccessSecret,
    { expiresIn: env.jwtAccessExpiresIn }
  );
};

// Génération d'un refresh token JWT (longue durée — cookie httpOnly).
// Le claim `tv` fige le token_version du compte : un changement de mot de passe
// l'incrémente en base, rendant tous les refresh tokens antérieurs invalides.
const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id, tv: user.token_version ?? 0 },
    env.jwtRefreshSecret,
    { expiresIn: env.jwtRefreshExpiresIn }
  );
};

// Token intermédiaire "MFA en attente" — secret DÉDIÉ, distinct de jwtAccessSecret/jwtRefreshSecret.
// Un token signé avec ce secret ne peut jamais être accepté par requireAuth (échec de
// signature), ce qui rend le bypass du second facteur impossible plutôt que dépendant
// d'un flag applicatif à vérifier partout.
const generateMfaPendingToken = (user) => {
  return jwt.sign(
    { id: user.id, purpose: 'mfa_pending' },
    env.jwtMfaPendingSecret,
    { expiresIn: env.jwtMfaPendingExpiresIn }
  );
};

// Options du cookie refresh token — httpOnly/Secure, SameSite=Lax en dev (proxy Vite), Strict en prod
const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: env.nodeEnv === 'production' ? 'Strict' : 'Lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/v1/auth',
});

// Génère un token de vérification email, le stocke haché (SHA-256) et envoie l'email.
// Le flag `blocking` distingue les deux usages :
//   - inscription (blocking=false) : un échec ne doit jamais interrompre le flux
//   - renvoi manuel (blocking=true) : on veut remonter l'erreur à l'appelant
/* `newsletter` : l'e-mail doit annoncer que ce clic confirme aussi l'inscription à
   la newsletter (CLI-05). Non précisé (renvoi du lien), on regarde s'il existe une
   pré-inscription en attente pour cette adresse. */
const issueEmailVerification = async (user, { blocking = false, newsletter } = {}) => {
  try {
    const mentionNewsletter = newsletter
      ?? await newsletterRepository.hasPendingSubscription(user.email).catch(() => false);
    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 heures

    await userRepository.saveVerifyToken(user.id, tokenHash, expiresAt);

    emailService.sendEmailVerification({ user, verifyToken: rawToken, newsletter: mentionNewsletter }).catch((err) => {
      console.error('[Email] Vérification email non envoyée :', err.message);
    });
  } catch (err) {
    // À l'inscription, on n'interrompt pas : le compte est créé, l'utilisateur
    // pourra redemander un email via le bandeau « confirmez votre email ».
    console.error('[Email] Génération du token de vérification échouée :', err.message);
    if (blocking) throw err;
  }
};

const register = async ({ email, password, firstName, lastName, locale, newsletter = false }) => {
  const exists = await userRepository.emailExists(email);
  if (exists) {
    throw new AppError('Un compte existe déjà avec cet email.', 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const userId = await userRepository.create({ email, passwordHash, firstName, lastName, locale });
  const user = await userRepository.findById(userId);

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Email de bienvenue — non bloquant (échec silencieux)
  emailService.sendWelcome({ user }).catch((err) => {
    console.error('[Email] Bienvenue non envoyé :', err.message);
  });

  /* Newsletter : consentement recueilli à l'inscription, mais conservé inactif tant que
     l'adresse n'est pas confirmée (double opt-in). Échec non bloquant — on ne perd pas
     une inscription client pour un abonnement marketing. */
  /* Attendue (et non lancée en parallèle) : l'e-mail de vérification qui suit doit
     savoir si la pré-inscription existe, pour l'annoncer. */
  let newsletterPending = false;
  if (newsletter) {
    try {
      await newsletterRepository.subscribePending(email, locale);
      newsletterPending = true;
    } catch (err) {
      console.error('[Newsletter] Pré-inscription échouée :', err.message);
    }
  }

  // Email de vérification d'adresse — non bloquant (n'interrompt jamais l'inscription)
  await issueEmailVerification(user, { blocking: false, newsletter: newsletterPending });

  return { user, accessToken, refreshToken };
};

// Confirmation de l'adresse email via le token reçu par email.
// Le token est à usage unique (effacé après vérification). Un lien déjà consommé
// ou expiré ne peut plus être relié à un compte → 400 (le front affiche un message adapté).
const verifyEmail = async (rawToken) => {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const user = await userRepository.findByVerifyToken(tokenHash);

  if (!user) throw new AppError('Lien de vérification invalide ou expiré.', 400);

  await userRepository.markEmailVerified(user.id);

  /* L'adresse est prouvée : une éventuelle pré-inscription newsletter devient effective.
     Sans effet si le client n'en avait pas demandé, ou s'il s'est désabonné depuis. */
  newsletterRepository.confirmPending(user.email).catch((err) => {
    console.error('[Newsletter] Confirmation échouée :', err.message);
  });

  return { email: user.email };
};

// Renvoi d'un email de vérification (utilisateur connecté non encore vérifié)
const resendVerification = async (userId) => {
  const user = await userRepository.findById(userId);
  if (!user) throw new AppError('Utilisateur introuvable.', 404);
  if (user.email_verified_at) return; // déjà vérifié — rien à faire
  await issueEmailVerification(user, { blocking: true });
};

const login = async ({ email, password }) => {
  const user = await userRepository.findByEmail(email);

  // Message générique — ne pas préciser si c'est l'email ou le mot de passe qui est incorrect
  if (!user || user.deleted_at) {
    throw new AppError('Email ou mot de passe incorrect.', 401);
  }

  if (!user.is_active) {
    throw new AppError('Ce compte a été désactivé. Contactez le support.', 403);
  }

  // Aucun mot de passe défini (compte historique incomplet) — message générique
  if (!user.password_hash) {
    throw new AppError('Email ou mot de passe incorrect.', 401);
  }

  const passwordValid = await bcrypt.compare(password, user.password_hash);
  if (!passwordValid) {
    throw new AppError('Email ou mot de passe incorrect.', 401);
  }

  // MFA obligatoire pour les rôles du back-office (admin, super_admin) — jamais pour un compte client.
  // Aucun cookie refresh n'est posé tant que le second facteur n'est pas validé :
  // un attaquant en possession du seul mot de passe ne peut obtenir aucun artefact
  // de session longue durée.
  if (isAdminRole(user.role)) {
    const mfaRow = await mfaRepository.findByUserId(user.id);
    const mfaPendingToken = generateMfaPendingToken(user);

    return {
      mfaRequired: mfaRow?.enabled_at ? 'verify' : 'setup',
      mfaPendingToken,
      user,
    };
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  return { user, accessToken, refreshToken };
};

const refreshToken = async (token) => {
  if (!token) {
    throw new AppError('Token de rafraîchissement manquant.', 401);
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtRefreshSecret);
  } catch {
    throw new AppError('Token de rafraîchissement invalide ou expiré.', 401);
  }

  const user = await userRepository.findById(payload.id);
  if (!user || !user.is_active) {
    throw new AppError('Utilisateur introuvable ou inactif.', 401);
  }

  // Le token_version du token doit correspondre à celui du compte — sinon le mot
  // de passe a changé depuis l'émission (tokens antérieurs révoqués).
  // `tv` absent = token émis avant cette fonctionnalité → toléré une fois (== 0).
  if ((payload.tv ?? 0) !== user.token_version) {
    throw new AppError('Session expirée. Veuillez vous reconnecter.', 401);
  }

  const accessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);

  return { user, accessToken, refreshToken: newRefreshToken };
};

// Demande de réinitialisation de mot de passe
const forgotPassword = async (email) => {
  const user = await userRepository.findByEmail(email);

  // Réponse générique même si l'email n'existe pas (anti-énumération)
  if (!user || user.deleted_at || !user.is_active) return;

  // Token aléatoire — hachage SHA-256 stocké en base, token brut envoyé par email
  const rawToken   = crypto.randomBytes(32).toString('hex');
  const tokenHash  = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt  = new Date(Date.now() + 60 * 60 * 1000); // 1 heure

  await userRepository.saveResetToken(user.id, tokenHash, expiresAt);

  emailService.sendPasswordReset({ user, resetToken: rawToken }).catch((err) => {
    console.error('[Email] Reset password non envoyé :', err.message);
  });
};

// Réinitialisation effective du mot de passe
const resetPassword = async (rawToken, newPassword) => {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const user = await userRepository.findByResetToken(tokenHash);

  if (!user) throw new AppError('Lien de réinitialisation invalide ou expiré.', 400);

  /* Compte du back-office : même exigence qu'au changement de mot de passe depuis
     le profil (12 caractères, une majuscule) — c'est par ce lien que le compte
     super-administrateur choisit son premier mot de passe. */
  if (isAdminRole(user.role)) {
    if (newPassword.length < 12 || !/[A-Z]/.test(newPassword)) {
      throw new AppError('Le mot de passe doit contenir au moins 12 caractères, dont une majuscule.', 400);
    }
  } else if (newPassword.length < 8) {
    throw new AppError('Le mot de passe doit contenir au moins 8 caractères.', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await userRepository.updatePassword(user.id, passwordHash);
};

module.exports = {
  register, login, refreshToken, refreshCookieOptions,
  forgotPassword, resetPassword, verifyEmail, resendVerification,
  generateAccessToken, generateRefreshToken,
};
