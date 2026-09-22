const newsletterRepository = require('../repositories/newsletter.repository');
const { AppError } = require('../middlewares/errorHandler');
const { verifyUnsubscribeToken } = require('../utils/newsletter.utils');

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
    const { email, token } = req.body;

    /* Le jeton prouve que le demandeur a bien reçu l'e-mail adressé à cette
       adresse. Sans ce contrôle, connaître une adresse suffisait à désabonner
       son propriétaire (CLI-05). */
    if (!verifyUnsubscribeToken(email, token)) {
      return next(new AppError('Lien de désinscription invalide ou expiré.', 400));
    }

    const removed = await newsletterRepository.unsubscribe(email);

    /* Une adresse absente ou déjà désabonnée renvoie un succès : c'est le
       résultat attendu par la personne qui clique — elle ne reçoit plus rien.
       Répondre « introuvable » transformerait par ailleurs ce lien en moyen de
       vérifier si une adresse est inscrite. */
    if (!removed) {
      return res.json({ success: true, message: 'Vous ne recevez plus notre newsletter.' });
    }
    res.json({ success: true, message: 'Désabonnement effectué.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { subscribe, unsubscribe };
