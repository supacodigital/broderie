const jwt = require('jsonwebtoken');
const { AppError } = require('./errorHandler');

// Vérifie le JWT access token envoyé dans le header Authorization
// Le token est stocké en mémoire React — jamais dans localStorage (voir CLAUDE.md)
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentification requise.', 401));
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    // Rôle toujours lu depuis le token — jamais depuis le body du client
    req.user = { id: payload.id, role: payload.role, locale: payload.locale };
    next();
  } catch {
    next(new AppError('Token invalide ou expiré.', 401));
  }
};

module.exports = { requireAuth };
