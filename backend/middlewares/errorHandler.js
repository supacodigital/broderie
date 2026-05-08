// Middleware de gestion centralisée des erreurs
// Le stack trace est loggé côté serveur mais jamais exposé au client
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  // Log complet en développement, log minimal en production
  if (process.env.NODE_ENV !== 'production') {
    console.error('❌ Erreur:', err);
  } else {
    console.error(`❌ [${new Date().toISOString()}] ${statusCode} — ${err.message}`);
  }

  // Réponse générique en production — jamais exposer les détails internes
  if (statusCode === 500 && process.env.NODE_ENV === 'production') {
    return res.status(500).json({
      success: false,
      message: 'Une erreur est survenue. Veuillez réessayer.',
    });
  }

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Une erreur est survenue.',
    ...(err.errors && { errors: err.errors }),
  });
};

// Classe d'erreur applicative avec statusCode
class AppError extends Error {
  constructor(message, statusCode = 500, errors = null) {
    super(message);
    this.statusCode = statusCode;
    if (errors) this.errors = errors;
  }
}

module.exports = { errorHandler, AppError };
