const jwt = require('jsonwebtoken');

// Auth optionnelle — décode le token si présent, ne bloque pas les anonymes
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = { id: payload.id, role: payload.role, locale: payload.locale };
  } catch {
    // Token invalide ignoré — traité comme anonyme
  }
  next();
};

module.exports = { optionalAuth };
