const { AppError } = require('./errorHandler');
const userRepository = require('../repositories/user.repository');

// Exige que l'adresse email du compte soit vérifiée.
// À placer APRÈS requireAuth. Fait une lecture BDD (l'access token ne porte pas
// email_verified_at) — réservé aux quelques routes qui en ont besoin (commande, avis).
const requireVerifiedEmail = async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.user.id);
    if (!user) return next(new AppError('Utilisateur introuvable.', 404));
    if (!user.email_verified_at) {
      return next(new AppError('Veuillez confirmer votre adresse email avant de continuer.', 403));
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { requireVerifiedEmail };
