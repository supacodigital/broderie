const jwt = require('jsonwebtoken');
const env = require('../config/env');

// Auth optionnelle — décode le token si présent, ne bloque pas les anonymes
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, env.jwtAccessSecret);
    req.user = { id: payload.id, role: payload.role, locale: payload.locale };
  } catch {
    // Token invalide ignoré — traité comme anonyme
  }
  next();
};

module.exports = { optionalAuth };
