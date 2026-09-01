const newsletterRepository = require('../repositories/newsletter.repository');
const { AppError } = require('../middlewares/errorHandler');

// req.body est déjà validé/normalisé par le middleware validate (voir routes/newsletter.routes.js)

const subscribe = async (req, res, next) => {
  try {
    const { email, locale } = req.body;
    const result = await newsletterRepository.subscribe(email, locale);

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
    const removed = await newsletterRepository.unsubscribe(req.body.email);
    if (!removed) return next(new AppError('Email introuvable ou déjà désabonné.', 404));
    res.json({ success: true, message: 'Désabonnement effectué.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { subscribe, unsubscribe };
