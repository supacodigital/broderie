const { AppError } = require('./errorHandler');

// Middleware de validation Zod centralisé.
//   validate(schema)              → valide et remplace req.body
//   validate(schema, 'query')     → valide req.query (résultat dans req.validatedQuery, req.query reste en lecture seule sur Express 5)
//
// En cas d'échec : AppError 400 avec le détail { field, message } au format standard.
const validate = (schema, source = 'body') => (req, res, next) => {
  const parsed = schema.safeParse(req[source]);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((e) => ({
      field: e.path.join('.') || source,
      message: e.message,
    }));
    return next(new AppError('Données invalides.', 400, errors));
  }
  if (source === 'body') {
    req.body = parsed.data;
  } else {
    req.validatedQuery = parsed.data;
  }
  next();
};

module.exports = { validate };
