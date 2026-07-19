const jwt = require('jsonwebtoken');
const { AppError } = require('./errorHandler');
const env = require('../config/env');

// Vérifie le JWT "MFA en attente" — état intermédiaire entre password validé et
// second facteur validé. Signé avec un secret DÉDIÉ (env.jwtMfaPendingSecret),
// différent de env.jwtAccessSecret : un token MFA pending ne peut donc jamais être
// accepté par requireAuth, et inversement un vrai access token échoue ici (mauvaise
// signature). Le claim `purpose` est une seconde barrière, défense en profondeur.
const requireMfaPending = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Session expirée, veuillez vous reconnecter.', 401));
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, env.jwtMfaPendingSecret);
    if (payload.purpose !== 'mfa_pending') {
      return next(new AppError('Session expirée, veuillez vous reconnecter.', 401));
    }
    // Nom volontairement différent de req.user — ne doit jamais être confondu
    // avec une session pleinement authentifiée par un controller en aval.
    req.mfaPendingUserId = payload.id;
    next();
  } catch {
    next(new AppError('Session expirée, veuillez vous reconnecter.', 401));
  }
};

module.exports = { requireMfaPending };
