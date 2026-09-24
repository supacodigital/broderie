const { AppError } = require('./errorHandler');

/* Rôles du back-office (ADM-08).
   `super_admin` a TOUT ce qu'a `admin`, plus les pages de contenu (CGV, mentions,
   Notre Histoire), le bandeau d'annonce et les blocs de la page d'accueil.
   Une route ouverte à `admin` l'est donc aussi à `super_admin` — y compris les
   protections attachées au rôle (double authentification obligatoire, mot de
   passe renforcé) : un rôle plus large ne doit jamais être moins protégé. */
const ADMIN_ROLES = ['admin', 'super_admin'];
const isAdminRole = (role) => ADMIN_ROLES.includes(role);

// Vérifie que l'utilisateur authentifié possède l'un des rôles autorisés
// Le rôle est toujours lu depuis req.user (extrait du JWT) — jamais depuis le body
const requireRole = (...allowedRoles) => {
  const allowed = allowedRoles.includes('admin') ? [...allowedRoles, 'super_admin'] : allowedRoles;
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentification requise.', 401));
    }

    if (!allowed.includes(req.user.role)) {
      return next(new AppError('Accès non autorisé.', 403));
    }

    next();
  };
};

module.exports = { requireRole, isAdminRole, ADMIN_ROLES };
