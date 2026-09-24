/* Erreurs de paiement — réactivation de Twint et de la carte (25.09).

   Une clé Stripe absente, expirée ou révoquée, ou un moyen de paiement non
   activé sur le compte, sont des problèmes de configuration de la boutique.
   Sans traduction, la cliente reçoit « une erreur est survenue » au moment de
   payer et abandonne sa commande sans que personne ne sache pourquoi. */

jest.mock('../../config/stripe', () => ({
  paymentIntents: { create: jest.fn() },
}));

jest.mock('../../repositories/order.repository', () => ({
  lockOrderForPaymentIntent: jest.fn(async () => ({ order: { id: 1, total: '15.50' } })),
  // Filtre sur le propriétaire quand un userId est fourni (voir order.repository.js)
  findById: jest.fn(async () => ({ id: 1, total: '15.50' })),
}));

jest.mock('../../repositories/payment.repository', () => ({
  updateStatusByOrder: jest.fn(),
  findByOrderIdAndMethod: jest.fn(),
  findLatestIntentId: jest.fn(),
}));

const stripe = require('../../config/stripe');
const paymentRepository = require('../../repositories/payment.repository');
const { createTwintIntent, createCardIntent } = require('../../services/payment.service');

// Reproduit la forme des erreurs levées par la librairie Stripe
const stripeError = (type, message, code) => Object.assign(new Error(message), { type, code });

describe('paiement — clé Stripe refusée', () => {
  beforeEach(() => jest.clearAllMocks());

  /* Le cas rencontré en développement : la clé de test avait expiré. En
     production cela arrive si la clé est révoquée ou mal recopiée. */
  test('Twint : une clé expirée renvoie un 503 qui oriente vers un autre moyen', async () => {
    stripe.paymentIntents.create.mockRejectedValue(
      stripeError('StripeAuthenticationError', 'Expired API Key provided: sk_test_xxx')
    );

    await expect(createTwintIntent(1, 7)).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringContaining('Facture'),
    });
  });

  test('Carte : même traitement qu\'avec Twint', async () => {
    stripe.paymentIntents.create.mockRejectedValue(
      stripeError('StripeAuthenticationError', 'Invalid API Key provided')
    );

    await expect(createCardIntent(1, 7)).rejects.toMatchObject({ statusCode: 503 });
  });

  /* Twint doit être activé séparément dans le compte Stripe : le code seul ne
     suffit pas, et l'oubli est probable lors d'une première mise en production. */
  test('un moyen de paiement non activé renvoie aussi un 503 explicite', async () => {
    stripe.paymentIntents.create.mockRejectedValue(
      stripeError('StripeInvalidRequestError', 'The payment method type twint is not activated', 'payment_method_not_available')
    );

    await expect(createTwintIntent(1, 7)).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringContaining('Retrait en boutique'),
    });
  });

  /* Une erreur ordinaire (montant invalide, commande introuvable) ne doit pas
     être maquillée en problème de configuration : elle remonte telle quelle. */
  test('une erreur Stripe ordinaire remonte sans être transformée', async () => {
    const original = stripeError('StripeInvalidRequestError', 'Amount must be at least 50 cents');
    stripe.paymentIntents.create.mockRejectedValue(original);

    await expect(createTwintIntent(1, 7)).rejects.toBe(original);
  });

  // La commande ne doit pas rester bloquée en « paiement en cours » après un échec
  test('le paiement est marqué en échec pour ne pas bloquer une nouvelle tentative', async () => {
    stripe.paymentIntents.create.mockRejectedValue(
      stripeError('StripeAuthenticationError', 'Expired API Key provided')
    );

    await expect(createTwintIntent(1, 7)).rejects.toBeDefined();
    expect(paymentRepository.updateStatusByOrder).toHaveBeenCalledWith(1, 'twint', 'failed');
  });
});

/* Cloisonnement des commandes — une cliente ne doit jamais atteindre le paiement
   d'une autre.

   La réutilisation d'un paiement déjà ouvert court-circuite le verrou qui portait
   jusqu'ici la vérification d'appartenance : sans contrôle propre, essayer des
   numéros de commande aurait suffi à obtenir le secret de paiement et le montant
   d'une commande tierce. */
describe('paiement — une commande appartient à une seule cliente', () => {
  const orderRepository = require('../../repositories/order.repository');

  beforeEach(() => jest.clearAllMocks());

  test.each([
    ['carte', createCardIntent],
    ['Twint', createTwintIntent],
  ])('%s : refuse la commande d\'une autre cliente', async (_label, createIntent) => {
    // findById filtre sur le propriétaire : rien ne remonte pour un autre compte
    orderRepository.findById.mockResolvedValue(null);

    await expect(createIntent(1, 999)).rejects.toMatchObject({ statusCode: 404 });

    // Aucun paiement n'est lu ni créé pour une commande qui n'est pas la sienne
    expect(paymentRepository.findByOrderIdAndMethod).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  test('la vérification précède la lecture du paiement existant', async () => {
    orderRepository.findById.mockResolvedValue(null);

    await expect(createCardIntent(1, 999)).rejects.toBeDefined();

    expect(orderRepository.findById).toHaveBeenCalledWith(1, 999);
  });
});
