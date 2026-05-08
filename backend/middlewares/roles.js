const { AppError } = require('./errorHandler');

// Vérifie que l'utilisateur authentifié possède l'un des rôles autorisés
// Le rôle est toujours lu depuis req.user (extrait du JWT) — jamais depuis le body
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentification requise.', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('Accès non autorisé.', 403));
    }

    next();
  };
};

module.exports = { requireRole };
