const { AppError } = require('./errorHandler');

/* Rôles du back-office.
   - `admin` : gestion de la boutique — commandes, clients, catalogue, paramètres.
   - `super_admin` : contenu du site UNIQUEMENT — pages, blocs de la page
     d'accueil, bandeau, textes légaux, e-mails et leur mise en forme (ADM-08).
   Le super-administrateur n'hérite plus des droits `admin` (décision du 26.09) :
   un compte dédié au contenu n'a pas à voir les commandes ni les données des
   clientes (moindre privilège, LPD). Une route se déclare donc pour le ou les
   rôles qu'elle sert, sans promotion implicite.
   Les deux rôles gardent les mêmes protections de connexion — double
   authentification obligatoire, mot de passe renforcé — via `isAdminRole` :
   un compte du back-office ne doit jamais être moins protégé qu'un autre. */
const ADMIN_ROLES = ['admin', 'super_admin'];
const isAdminRole = (role) => ADMIN_ROLES.includes(role);

// Vérifie que l'utilisateur authentifié possède l'un des rôles autorisés
// Le rôle est toujours lu depuis req.user (extrait du JWT) — jamais depuis le body
const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentification requise.', 401));
  }

  if (!allowedRoles.includes(req.user.role)) {
    return next(new AppError('Accès non autorisé.', 403));
  }

  next();
};

module.exports = { requireRole, isAdminRole, ADMIN_ROLES };
