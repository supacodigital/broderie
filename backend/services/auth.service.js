const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/user.repository');
const { AppError } = require('../middlewares/errorHandler');
const emailService = require('./email.service');
const googleClient = require('../config/google');
const env = require('../config/env');

const SALT_ROUNDS = 12;

// Génération d'un access token JWT (courte durée — stocké en mémoire React)
const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user.id, role: user.role, locale: user.locale },
    env.jwtAccessSecret,
    { expiresIn: env.jwtAccessExpiresIn }
  );
};

// Génération d'un refresh token JWT (longue durée — cookie httpOnly)
const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id },
    env.jwtRefreshSecret,
    { expiresIn: env.jwtRefreshExpiresIn }
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

const register = async ({ email, password, firstName, lastName, locale }) => {
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

  return { user, accessToken, refreshToken };
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

  // Compte Google sans mot de passe — orienter vers la connexion Google
  if (!user.password_hash) {
    throw new AppError('Ce compte utilise la connexion Google. Cliquez sur "Continuer avec Google".', 401);
  }

  const passwordValid = await bcrypt.compare(password, user.password_hash);
  if (!passwordValid) {
    throw new AppError('Email ou mot de passe incorrect.', 401);
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  return { user, accessToken, refreshToken };
};

// Connexion / inscription via Google OAuth — flux frontend-driven (idToken vérifié côté serveur)
const loginWithGoogle = async (idToken) => {
  if (!googleClient) {
    throw new AppError('Connexion Google non configurée.', 503);
  }

  // Vérification du token Google — lève une erreur si invalide ou expiré
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.googleClientId,
    });
    payload = ticket.getPayload();
  } catch {
    throw new AppError('Token Google invalide ou expiré.', 401);
  }

  const { sub: googleId, email, given_name: firstName, family_name: lastName, picture: avatarUrl } = payload;

  if (!email) {
    throw new AppError('Impossible de récupérer l\'email depuis le compte Google.', 400);
  }

  // Cas 1 — compte déjà lié à ce google_id
  let user = await userRepository.findByGoogleId(googleId);

  if (user) {
    if (!user.is_active) throw new AppError('Ce compte a été désactivé. Contactez le support.', 403);
    // Mettre à jour l'avatar si changé
    await userRepository.linkGoogleAccount(user.id, googleId, avatarUrl);
    user = await userRepository.findById(user.id);
  } else {
    // Cas 2 — email existant avec compte classique → liaison automatique
    const existing = await userRepository.findByEmail(email);

    if (existing) {
      if (existing.deleted_at) throw new AppError('Ce compte a été supprimé.', 403);
      if (!existing.is_active) throw new AppError('Ce compte a été désactivé. Contactez le support.', 403);
      await userRepository.linkGoogleAccount(existing.id, googleId, avatarUrl);
      user = await userRepository.findById(existing.id);
    } else {
      // Cas 3 — nouvel utilisateur → création sans mot de passe
      const userId = await userRepository.create({
        email,
        passwordHash: null,
        firstName:    firstName  || email.split('@')[0],
        lastName:     lastName   || '',
        locale:       'fr',
        googleId,
        avatarUrl,
      });
      user = await userRepository.findById(userId);

      // Email de bienvenue — non bloquant
      emailService.sendWelcome({ user }).catch((err) => {
        console.error('[Email] Bienvenue Google non envoyé :', err.message);
      });
    }
  }

  const accessToken  = generateAccessToken(user);
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

  if (newPassword.length < 8) throw new AppError('Le mot de passe doit contenir au moins 8 caractères.', 400);

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await userRepository.updatePassword(user.id, passwordHash);
};

module.exports = { register, login, loginWithGoogle, refreshToken, refreshCookieOptions, forgotPassword, resetPassword };
