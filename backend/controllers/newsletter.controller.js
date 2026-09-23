const newsletterRepository = require('../repositories/newsletter.repository');
const { AppError } = require('../middlewares/errorHandler');
const emailService = require('../services/email.service');
const {
  verifyUnsubscribeToken, verifyConfirmToken, buildConfirmUrl, normalizeEmail,
} = require('../utils/newsletter.utils');

// req.body est déjà validé/normalisé par le middleware validate (voir routes/newsletter.routes.js)

/* Même réponse dans tous les cas (CLI-05) : « déjà inscrite » révélait à
   n'importe qui qu'une adresse figure dans la liste des abonnées. */
const SUBSCRIBE_MESSAGE =
  'Merci ! Consultez votre boîte e-mail : un lien vous permet de confirmer votre inscription. '
  + 'Vous ne recevrez rien tant que vous ne l\'aurez pas confirmée.';

/* Demande d'inscription depuis le formulaire du site — double opt-in (CLI-05).
   L'abonnement n'est actif qu'après le clic sur le lien reçu par e-mail. */
const subscribe = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { sendConfirmation } = await newsletterRepository.requestSubscription(email, req.body.locale);

    if (sendConfirmation) {
      try {
        await emailService.sendNewsletterConfirmation({ email, confirmUrl: buildConfirmUrl(email) });
      } catch (err) {
        console.error('[Newsletter] E-mail de confirmation non envoyé :', err.message);
        return next(new AppError('L\'envoi de l\'e-mail de confirmation a échoué. Veuillez réessayer dans quelques minutes.', 503));
      }
    }
    res.status(202).json({ success: true, message: SUBSCRIBE_MESSAGE });
  } catch (error) {
    next(error);
  }
};

// Clic sur le lien de confirmation reçu par e-mail
const confirm = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!verifyConfirmToken(email, req.body.token)) {
      return next(new AppError('Ce lien de confirmation est invalide ou a expiré. Inscrivez-vous à nouveau depuis le site.', 400));
    }

    const result = await newsletterRepository.confirmSubscription(email);
    if (result.notFound) {
      return next(new AppError('Cette demande d\'inscription n\'existe plus. Inscrivez-vous à nouveau depuis le site.', 404));
    }
    res.json({
      success: true,
      message: result.alreadyActive
        ? 'Votre inscription était déjà confirmée.'
        : 'Votre inscription à la newsletter est confirmée. Merci !',
    });
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

module.exports = { subscribe, confirm, unsubscribe };
