const newsletterRepository = require('../repositories/newsletter.repository');
const { AppError } = require('../middlewares/errorHandler');

const subscribe = async (req, res, next) => {
  try {
    const { email, locale } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return next(new AppError('Adresse email invalide.', 400));
    }

    const result = await newsletterRepository.subscribe(email, locale || 'fr');

    if (result.alreadySubscribed) {
      return res.json({ success: true, message: 'Vous êtes déjà inscrit à la newsletter.' });
    }

    res.status(201).json({ success: true, message: 'Inscription confirmée. Merci !' });
  } catch (error) {
    next(error);
  }
};

const unsubscribe = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return next(new AppError('Email obligatoire.', 400));

    const removed = await newsletterRepository.unsubscribe(email);
    if (!removed) return next(new AppError('Email introuvable ou déjà désabonné.', 404));

    res.json({ success: true, message: 'Désabonnement effectué.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { subscribe, unsubscribe };
