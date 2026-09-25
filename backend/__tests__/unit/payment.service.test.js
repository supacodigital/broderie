// Tests unitaires payment.service — stripe, repositories et services externes mockés

// Mock stripe comme un objet (jamais null) pour pouvoir surcharger ses méthodes par test
jest.mock('../../config/stripe', () => ({
  paymentIntents: {},
  paymentMethods: {},
  webhooks: {},
}));

jest.mock('../../repositories/payment.repository');
jest.mock('../../repositories/order.repository');
jest.mock('../../repositories/cart.repository');
jest.mock('../../services/loyalty.service');
jest.mock('../../config/db', () => ({ pool: {} }));
jest.mock('../../config/env', () => ({
  stripeWebhookSecret: 'whsec_test',
  clientUrl: 'http://localhost:5173',
  nodeEnv: 'test',
}));

const stripe            = require('../../config/stripe');
const paymentRepository = require('../../repositories/payment.repository');
const orderRepository   = require('../../repositories/order.repository');
const loyaltyService    = require('../../services/loyalty.service');
const cartRepository    = require('../../repositories/cart.repository');
const paymentService    = require('../../services/payment.service');

beforeEach(() => {
  jest.clearAllMocks();
  /* Par défaut, la commande appartient bien à la cliente qui la paie.
     `createCardIntent` / `createTwintIntent` vérifient l'appartenance AVANT de
     réutiliser un paiement déjà ouvert : ce raccourci court-circuite
     lockOrderForPaymentIntent, qui portait seul cette vérification. Les tests de
     cloisonnement (payment.errors.test.js) couvrent le cas inverse. */
  orderRepository.findById.mockResolvedValue({ id: 1, user_id: 10, total: '15.50' });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOrder(overrides = {}) {
  return {
    id: 1,
    user_id: 10,
    status: 'pending',
    total: '58.40',
    ...overrides,
  };
}


// ── createCardIntent() ────────────────────────────────────────────────────────
// lockOrderForPaymentIntent() remplace findById+vérif statut : verrouille la
// commande et réserve la ligne payments avant l'appel Stripe (protection contre
// la double création concurrente de PaymentIntent — double-clic, deux onglets).

describe('payment.service — createCardIntent()', () => {
  test('lève 404 si commande introuvable', async () => {
    orderRepository.lockOrderForPaymentIntent.mockRejectedValue({ statusCode: 404 });

    await expect(paymentService.createCardIntent(99)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('lève 400 si commande déjà payée', async () => {
    orderRepository.lockOrderForPaymentIntent.mockRejectedValue({ statusCode: 400 });

    await expect(paymentService.createCardIntent(1)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('lève 409 si une création de PaymentIntent est déjà en cours (course concurrente)', async () => {
    orderRepository.lockOrderForPaymentIntent.mockRejectedValue({ statusCode: 409 });

    await expect(paymentService.createCardIntent(1)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('crée un PaymentIntent, complète la ligne payments réservée, retourne clientSecret + amount', async () => {
    orderRepository.lockOrderForPaymentIntent.mockResolvedValue({ order: makeOrder(), paymentId: 5 });
    stripe.paymentIntents = {
      create: jest.fn().mockResolvedValue({ id: 'pi_test', client_secret: 'cs_test' }),
    };
    paymentRepository.updateStatusByOrder.mockResolvedValue();

    const result = await paymentService.createCardIntent(1);

    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining({
      currency: 'chf',
      payment_method_types: ['card'],
    }));
    expect(paymentRepository.updateStatusByOrder).toHaveBeenCalledWith(1, 'card', 'pending', 'pi_test');
    expect(result.clientSecret).toBe('cs_test');
    expect(result.amount).toBe('58.40');
  });

  test('libère la réservation (statut failed) si l\'appel Stripe échoue', async () => {
    orderRepository.lockOrderForPaymentIntent.mockResolvedValue({ order: makeOrder(), paymentId: 5 });
    stripe.paymentIntents = {
      create: jest.fn().mockRejectedValue(new Error('Stripe indisponible')),
    };
    paymentRepository.updateStatusByOrder.mockResolvedValue();

    await expect(paymentService.createCardIntent(1)).rejects.toThrow('Stripe indisponible');
    expect(paymentRepository.updateStatusByOrder).toHaveBeenCalledWith(1, 'card', 'failed');
  });

  test('fonctionne aussi avec statut awaiting_payment', async () => {
    orderRepository.lockOrderForPaymentIntent.mockResolvedValue({ order: makeOrder({ status: 'awaiting_payment' }), paymentId: 6 });
    stripe.paymentIntents = {
      create: jest.fn().mockResolvedValue({ id: 'pi_aw', client_secret: 'cs_aw' }),
    };
    paymentRepository.updateStatusByOrder.mockResolvedValue();

    const result = await paymentService.createCardIntent(1);
    expect(result.clientSecret).toBe('cs_aw');
  });

  test('scope la commande sur userId (lockOrderForPaymentIntent reçoit orderId + userId + method)', async () => {
    orderRepository.lockOrderForPaymentIntent.mockRejectedValue({ statusCode: 404 });

    await expect(paymentService.createCardIntent(42, 10)).rejects.toMatchObject({ statusCode: 404 });
    expect(orderRepository.lockOrderForPaymentIntent).toHaveBeenCalledWith(42, 10, 'card');
  });
});

// ── createTwintIntent() ───────────────────────────────────────────────────────

describe('payment.service — createTwintIntent()', () => {
  test('lève 404 si commande introuvable', async () => {
    orderRepository.lockOrderForPaymentIntent.mockRejectedValue({ statusCode: 404 });

    await expect(paymentService.createTwintIntent(99)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('lève 400 si statut commande invalide', async () => {
    orderRepository.lockOrderForPaymentIntent.mockRejectedValue({ statusCode: 400 });

    await expect(paymentService.createTwintIntent(1)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('lève 409 si une création de PaymentIntent est déjà en cours (course concurrente)', async () => {
    orderRepository.lockOrderForPaymentIntent.mockRejectedValue({ statusCode: 409 });

    await expect(paymentService.createTwintIntent(1)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('retourne le client_secret (Twint sans QR — redirection Stripe.js)', async () => {
    orderRepository.lockOrderForPaymentIntent.mockResolvedValue({ order: makeOrder(), paymentId: 7 });
    stripe.paymentIntents = {
      create: jest.fn().mockResolvedValue({ id: 'pi_twint', client_secret: 'cs_twint' }),
    };
    paymentRepository.updateStatusByOrder.mockResolvedValue();

    const result = await paymentService.createTwintIntent(1);

    expect(result.clientSecret).toBe('cs_twint');
    expect(result.amount).toBeDefined();
    // Plus de QR généré côté serveur
    expect(result.qrUrl).toBeUndefined();
  });

  test('crée le PaymentIntent avec le type twint et l\'order_id en metadata', async () => {
    orderRepository.lockOrderForPaymentIntent.mockResolvedValue({ order: makeOrder(), paymentId: 8 });
    const create = jest.fn().mockResolvedValue({ id: 'pi_twint', client_secret: 'cs_twint' });
    stripe.paymentIntents = { create };
    paymentRepository.updateStatusByOrder.mockResolvedValue();

    await paymentService.createTwintIntent(1);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      currency: 'chf',
      payment_method_types: ['twint'],
      metadata: { order_id: '1' },
    }));
  });

  test('libère la réservation (statut failed) si l\'appel Stripe échoue', async () => {
    orderRepository.lockOrderForPaymentIntent.mockResolvedValue({ order: makeOrder(), paymentId: 9 });
    stripe.paymentIntents = {
      create: jest.fn().mockRejectedValue(new Error('Stripe indisponible')),
    };
    paymentRepository.updateStatusByOrder.mockResolvedValue();

    await expect(paymentService.createTwintIntent(1)).rejects.toThrow('Stripe indisponible');
    expect(paymentRepository.updateStatusByOrder).toHaveBeenCalledWith(1, 'twint', 'failed');
  });

  test('scope la commande sur userId (lockOrderForPaymentIntent reçoit orderId + userId + method)', async () => {
    orderRepository.lockOrderForPaymentIntent.mockRejectedValue({ statusCode: 404 });

    await expect(paymentService.createTwintIntent(42, 10)).rejects.toMatchObject({ statusCode: 404 });
    expect(orderRepository.lockOrderForPaymentIntent).toHaveBeenCalledWith(42, 10, 'twint');
  });
});

// ── handleWebhook() ───────────────────────────────────────────────────────────

/* Le webhook contrôle désormais le montant et la devise avant de valider une
   commande (audit du 22/09). Les événements simulés portent donc par défaut un
   montant qui couvre la commande de référence (makeOrder → 15.50) et des francs
   suisses ; les tests qui éprouvent ces contrôles fournissent leurs propres
   valeurs, qui priment. */
const mockEvent = (obj) => {
  stripe.webhooks = {
    constructEvent: jest.fn().mockReturnValue({
      id: obj.id ?? `evt_${Math.random().toString(36).slice(2)}`,
      type: obj.type,
      // 5840 centimes = 58.40, le total de makeOrder()
      data: { object: { amount_received: 5840, currency: 'chf', ...obj.data } },
    }),
  };
};

describe('payment.service — handleWebhook()', () => {
  beforeEach(() => {
    // event nouveau par défaut
    paymentRepository.hasProcessedWebhookEvent.mockResolvedValue(false);
    paymentRepository.registerWebhookEvent.mockResolvedValue(true);
    orderRepository.markPaidFromWebhook.mockResolvedValue({ statusChanged: true });
  });

  test('lève 400 si signature invalide', async () => {
    stripe.webhooks = {
      constructEvent: jest.fn().mockImplementation(() => { throw new Error('bad sig'); }),
    };
    await expect(paymentService.handleWebhook('raw', 'bad')).rejects.toMatchObject({ statusCode: 400 });
  });

  test('ignore un event déjà traité (hasProcessedWebhookEvent → true)', async () => {
    paymentRepository.hasProcessedWebhookEvent.mockResolvedValue(true);
    mockEvent({ id: 'evt_dup', type: 'payment_intent.succeeded',
      data: { id: 'pi_x', metadata: { order_id: '1' }, payment_method_types: ['card'] } });

    await paymentService.handleWebhook('raw', 'sig');

    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
    expect(paymentRepository.registerWebhookEvent).not.toHaveBeenCalled();
  });

  test('acquitte l\'event APRÈS traitement réussi', async () => {
    mockEvent({ id: 'evt_ok', type: 'payment_intent.succeeded',
      data: { id: 'pi_ok', metadata: { order_id: '1' }, payment_method_types: ['card'] } });
    orderRepository.findById.mockResolvedValue(makeOrder({ status: 'paid' }));
    loyaltyService.processOrderEarning.mockResolvedValue();

    await paymentService.handleWebhook('raw', 'sig');

    expect(orderRepository.markPaidFromWebhook).toHaveBeenCalled();
    expect(paymentRepository.registerWebhookEvent).toHaveBeenCalledWith('evt_ok', 'payment_intent.succeeded');
  });

  test('n\'acquitte PAS l\'event si le traitement échoue (Stripe doit pouvoir retenter)', async () => {
    // Sans cette garantie, un échec transitoire ferait perdre définitivement le
    // paiement : Stripe retenterait et l'event serait ignoré comme « déjà traité ».
    orderRepository.markPaidFromWebhook.mockRejectedValue(new Error('deadlock'));
    mockEvent({ id: 'evt_ko', type: 'payment_intent.succeeded',
      data: { id: 'pi_ko', metadata: { order_id: '1' }, payment_method_types: ['card'] } });

    await expect(paymentService.handleWebhook('raw', 'sig')).rejects.toThrow('deadlock');
    expect(paymentRepository.registerWebhookEvent).not.toHaveBeenCalled();
  });

  test('ignore les événements inconnus sans erreur', async () => {
    mockEvent({ type: 'customer.created', data: {} });
    await expect(paymentService.handleWebhook('raw', 'sig')).resolves.toBeUndefined();
  });

  test('marque la commande payée pour payment_intent.succeeded', async () => {
    mockEvent({ type: 'payment_intent.succeeded',
      data: { id: 'pi_ok', metadata: { order_id: '1' }, payment_method_types: ['card'] } });
    orderRepository.findById.mockResolvedValue(makeOrder({ status: 'paid' }));
    loyaltyService.processOrderEarning.mockResolvedValue();

    await paymentService.handleWebhook('raw', 'sig');

    expect(orderRepository.markPaidFromWebhook).toHaveBeenCalledWith(1, 'pi_ok', 'card');
  });

  test('ne crédite PAS la fidélité si le statut n\'a pas changé (retry / déjà payée)', async () => {
    orderRepository.markPaidFromWebhook.mockResolvedValue({ statusChanged: false });
    mockEvent({ type: 'payment_intent.succeeded',
      data: { id: 'pi_again', metadata: { order_id: '1' }, payment_method_types: ['card'] } });

    await paymentService.handleWebhook('raw', 'sig');

    expect(loyaltyService.processOrderEarning).not.toHaveBeenCalled();
  });

  test('crédite la fidélité une fois si le statut passe à paid', async () => {
    mockEvent({ type: 'payment_intent.succeeded',
      data: { id: 'pi_new', metadata: { order_id: '1' }, payment_method_types: ['card'] } });
    orderRepository.findById.mockResolvedValue(makeOrder({ user_id: 10, total: '58.40', status: 'paid' }));
    loyaltyService.processOrderEarning.mockResolvedValue();

    await paymentService.handleWebhook('raw', 'sig');

    expect(loyaltyService.processOrderEarning).toHaveBeenCalledWith(10, 1, '58.40');
  });

  test('propage l\'erreur si markPaidFromWebhook échoue', async () => {
    orderRepository.markPaidFromWebhook.mockRejectedValue(new Error('SQL error'));
    mockEvent({ type: 'payment_intent.succeeded',
      data: { id: 'pi_fail', metadata: { order_id: '1' }, payment_method_types: ['twint'] } });

    await expect(paymentService.handleWebhook('raw', 'sig')).rejects.toThrow('SQL error');
  });

  test('met à jour le statut en "failed" pour payment_intent.payment_failed', async () => {
    mockEvent({ type: 'payment_intent.payment_failed',
      data: { id: 'pi_fail', metadata: { order_id: '2' }, payment_method_types: ['twint'] } });
    paymentRepository.updateStatusByOrder.mockResolvedValue();

    await paymentService.handleWebhook('raw', 'sig');

    expect(paymentRepository.updateStatusByOrder).toHaveBeenCalledWith(2, 'twint', 'failed');
  });

  /* CLI-07 — une carte refusée doit apparaître comme telle dans l'administration,
     et non comme une commande à traiter. */
  test('passe la commande à « Paiement refusé » avec le motif de la banque, en français', async () => {
    mockEvent({ type: 'payment_intent.payment_failed',
      data: { id: 'pi_fail', metadata: { order_id: '3' }, payment_method_types: ['card'],
              last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds',
                                    message: 'Your card has insufficient funds.' } } });
    paymentRepository.updateStatusByOrder.mockResolvedValue();
    orderRepository.markPaymentFailed.mockResolvedValue(true);

    await paymentService.handleWebhook('raw', 'sig');

    expect(orderRepository.markPaymentFailed).toHaveBeenCalledWith(
      3, 'Paiement par carte refusé : fonds insuffisants'
    );
  });

  /* Le message brut de Stripe est en anglais : il s'affichait tel quel dans
     l'historique de commande de l'administration. */
  test('un refus Twint au motif inconnu garde un libellé français générique', async () => {
    mockEvent({ type: 'payment_intent.payment_failed',
      data: { id: 'pi_fail', metadata: { order_id: '3' }, payment_method_types: ['twint'],
              last_payment_error: { code: 'payment_method_provider_decline', decline_code: 'generic_decline',
                                    message: 'The PaymentIntent was declined by the provider.' } } });
    paymentRepository.updateStatusByOrder.mockResolvedValue();
    orderRepository.markPaymentFailed.mockResolvedValue(true);

    await paymentService.handleWebhook('raw', 'sig');

    expect(orderRepository.markPaymentFailed).toHaveBeenCalledWith(
      3, "Paiement Twint refusé : refusé ou annulé dans l'app Twint"
    );
  });

  /* CLI-07 — la confirmation d'une commande carte / Twint ne part qu'une fois
     le paiement accepté, plus à la création de la commande. */
  test('envoie les e-mails de confirmation quand une commande carte est payée', async () => {
    const orderService = require('../../services/order.service');
    const spy = jest.spyOn(orderService, 'sendOrderEmails').mockImplementation(() => {});
    orderRepository.findById.mockResolvedValue({ id: 4, user_id: 10, total: '58.40', status: 'paid', payment_method: 'card' });
    mockEvent({ type: 'payment_intent.succeeded',
      data: { id: 'pi_ok', metadata: { order_id: '4' }, payment_method_types: ['card'] } });

    await paymentService.handleWebhook('raw', 'sig');

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }), 'card');
    spy.mockRestore();
  });

  test('ne renvoie pas de confirmation pour une commande par facture réglée par Twint', async () => {
    const orderService = require('../../services/order.service');
    const spy = jest.spyOn(orderService, 'sendOrderEmails').mockImplementation(() => {});
    orderRepository.findById.mockResolvedValue({ id: 5, user_id: 10, total: '58.40', status: 'paid', payment_method: 'invoice_qr' });
    mockEvent({ type: 'payment_intent.succeeded',
      data: { id: 'pi_qr', metadata: { order_id: '5' }, payment_method_types: ['twint'] } });

    await paymentService.handleWebhook('raw', 'sig');

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  /* CLI-13 — le panier est conservé pendant le paiement carte / Twint : les
     articles payés en sortent à l'acceptation, pas avant. */
  test('retire les articles payés du panier quand une commande Twint est payée', async () => {
    const orderService = require('../../services/order.service');
    const spy = jest.spyOn(orderService, 'sendOrderEmails').mockImplementation(() => {});
    const items = [{ product_id: 12, variant_id: null, quantity: 2 }];
    orderRepository.findById.mockResolvedValue({ id: 6, user_id: 10, total: '58.40', status: 'paid', payment_method: 'twint', items });
    cartRepository.removeOrderedItems.mockResolvedValue();
    mockEvent({ type: 'payment_intent.succeeded',
      data: { id: 'pi_tw', metadata: { order_id: '6' }, payment_method_types: ['twint'] } });

    await paymentService.handleWebhook('raw', 'sig');

    expect(cartRepository.removeOrderedItems).toHaveBeenCalledWith(10, items);
    spy.mockRestore();
  });

  /* CLI-07 — le numéro de facture d'une commande carte / Twint n'est attribué
     qu'au paiement accepté, et avant l'envoi de la confirmation qui le porte. */
  test('numérote la facture au paiement accepté, avant les e-mails', async () => {
    const orderService = require('../../services/order.service');
    const calls = [];
    const numberSpy = jest.spyOn(orderService, 'numberInvoice').mockImplementation(async () => { calls.push('facture'); });
    const mailSpy = jest.spyOn(orderService, 'sendOrderEmails').mockImplementation(() => { calls.push('e-mails'); });
    orderRepository.findById.mockResolvedValue({ id: 8, user_id: 10, total: '58.40', status: 'paid', payment_method: 'card', items: [] });
    mockEvent({ type: 'payment_intent.succeeded',
      data: { id: 'pi_num', metadata: { order_id: '8' }, payment_method_types: ['card'] } });

    await paymentService.handleWebhook('raw', 'sig');

    expect(numberSpy).toHaveBeenCalledWith(8);
    expect(calls).toEqual(['facture', 'e-mails']);
    numberSpy.mockRestore();
    mailSpy.mockRestore();
  });

  test('ne touche pas au panier pour une facture réglée plus tard par QR Twint', async () => {
    // Le panier de la facture a été vidé à sa création ; celui d'aujourd'hui
    // appartient à un nouvel achat et ne doit pas être amputé.
    const orderService = require('../../services/order.service');
    const spy = jest.spyOn(orderService, 'sendOrderEmails').mockImplementation(() => {});
    orderRepository.findById.mockResolvedValue({ id: 7, user_id: 10, total: '58.40', status: 'paid', payment_method: 'invoice_qr', items: [] });
    mockEvent({ type: 'payment_intent.succeeded',
      data: { id: 'pi_qr2', metadata: { order_id: '7' }, payment_method_types: ['twint'] } });

    await paymentService.handleWebhook('raw', 'sig');

    expect(cartRepository.removeOrderedItems).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('ignore payment_intent.succeeded sans order_id dans metadata', async () => {
    mockEvent({ type: 'payment_intent.succeeded',
      data: { id: 'pi_no_order', metadata: {}, payment_method_types: ['card'] } });

    await paymentService.handleWebhook('raw', 'sig');
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
  });
});

/* ── Contrôles du webhook avant validation d'une commande ──
   Audit du 22/09 : la commande passait à « payée » sur la seule présence de son
   numéro dans les métadonnées du paiement. Ni le montant, ni la devise, ni le
   statut de la commande n'étaient vérifiés. */
describe('payment.service — le webhook vérifie ce qu\'il encaisse', () => {
  beforeEach(() => {
    paymentRepository.hasProcessedWebhookEvent.mockResolvedValue(false);
    paymentRepository.registerWebhookEvent.mockResolvedValue(true);
    orderRepository.markPaidFromWebhook.mockResolvedValue({ statusChanged: true });
    loyaltyService.processOrderEarning.mockResolvedValue();
  });

  /* Une commande soldée pour moins que son montant laisserait la boutique
     livrer sans avoir été payée. */
  test('refuse un paiement inférieur au montant de la commande', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder({ total: '56.50' }));
    mockEvent({ id: 'evt_short', type: 'payment_intent.succeeded',
      data: { id: 'pi_short', amount_received: 500, currency: 'chf',
              metadata: { order_id: '1' }, payment_method_types: ['card'] } });

    await paymentService.handleWebhook('raw', 'sig');

    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
    expect(paymentRepository.updateStatusByOrder).toHaveBeenCalledWith(1, 'card', 'failed');
  });

  test('accepte un paiement du montant exact', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder({ total: '56.50' }));
    mockEvent({ id: 'evt_exact', type: 'payment_intent.succeeded',
      data: { id: 'pi_exact', amount_received: 5650, currency: 'chf',
              metadata: { order_id: '1' }, payment_method_types: ['card'] } });

    await paymentService.handleWebhook('raw', 'sig');

    expect(orderRepository.markPaidFromWebhook).toHaveBeenCalledWith(1, 'pi_exact', 'card');
  });

  /* Refuser un trop-perçu pénaliserait la cliente : la commande est honorée et
     l'écart se règle par un remboursement. */
  test('accepte un paiement supérieur au montant dû', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder({ total: '56.50' }));
    mockEvent({ id: 'evt_over', type: 'payment_intent.succeeded',
      data: { id: 'pi_over', amount_received: 6000, currency: 'chf',
              metadata: { order_id: '1' }, payment_method_types: ['card'] } });

    await paymentService.handleWebhook('raw', 'sig');

    expect(orderRepository.markPaidFromWebhook).toHaveBeenCalled();
  });

  // La boutique n'encaisse qu'en francs suisses
  test('refuse un paiement dans une autre devise', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder({ total: '56.50' }));
    mockEvent({ id: 'evt_eur', type: 'payment_intent.succeeded',
      data: { id: 'pi_eur', amount_received: 5650, currency: 'eur',
              metadata: { order_id: '1' }, payment_method_types: ['card'] } });

    await paymentService.handleWebhook('raw', 'sig');

    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
  });

  test('acquitte l\'event même quand la commande est inconnue', async () => {
    orderRepository.findById.mockResolvedValue(null);
    mockEvent({ id: 'evt_ghost', type: 'payment_intent.succeeded',
      data: { id: 'pi_ghost', amount_received: 1000, currency: 'chf',
              metadata: { order_id: '999' }, payment_method_types: ['card'] } });

    await paymentService.handleWebhook('raw', 'sig');

    // Sans acquittement, Stripe retenterait indéfiniment un event insoluble
    expect(paymentRepository.registerWebhookEvent).toHaveBeenCalledWith('evt_ghost', 'payment_intent.succeeded');
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
  });

  /* Une commande annulée a rendu son stock : la marquer payée laisserait Julie
     avec une commande à honorer dont les articles sont retournés en rayon.
     Le refus vient du repository ; le service doit le signaler, pas le masquer. */
  test('signale un paiement reçu pour une commande qui ne peut plus être validée', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    orderRepository.markPaidFromWebhook.mockResolvedValue({ statusChanged: false });
    orderRepository.findById
      .mockResolvedValueOnce(makeOrder({ total: '14.00' }))      // contrôle du montant
      .mockResolvedValueOnce(makeOrder({ status: 'cancelled' })); // relecture après refus
    mockEvent({ id: 'evt_cancelled', type: 'payment_intent.succeeded',
      data: { id: 'pi_cancelled', amount_received: 1400, currency: 'chf',
              metadata: { order_id: '1' }, payment_method_types: ['twint'] } });

    await paymentService.handleWebhook('raw', 'sig');

    expect(spy.mock.calls.flat().join(' ')).toMatch(/cancelled/);
    spy.mockRestore();
  });
});


// ── CLI-15 : retour de l'app Twint / de 3-D Secure ───────────────────────────
// Au retour de la redirection, la page de paiement redemandait un paiement : un
// second PaymentIntent était créé pour une commande déjà réglée, ou la cliente
// lisait « Impossible de générer le paiement Twint ».

describe('payment.service — un paiement réglé n\'est jamais redemandé (CLI-15)', () => {
  test.each(['succeeded', 'processing'])(
    'createTwintIntent refuse (409) sans créer de PaymentIntent quand le précédent est « %s »',
    async (status) => {
      paymentRepository.findLatestIntentId.mockResolvedValue('pi_regle');
      const create = jest.fn();
      stripe.paymentIntents = {
        retrieve: jest.fn().mockResolvedValue({ id: 'pi_regle', status }),
        create,
      };

      await expect(paymentService.createTwintIntent(1, 10)).rejects.toMatchObject({ statusCode: 409 });
      expect(create).not.toHaveBeenCalled();
      expect(orderRepository.lockOrderForPaymentIntent).not.toHaveBeenCalled();
    }
  );

  test('createCardIntent réutilise un paiement refusé plutôt que d\'en créer un second', async () => {
    paymentRepository.findLatestIntentId.mockResolvedValue('pi_refuse');
    const create = jest.fn();
    stripe.paymentIntents = {
      retrieve: jest.fn().mockResolvedValue({ id: 'pi_refuse', status: 'requires_payment_method', client_secret: 'cs_refuse' }),
      create,
    };

    const result = await paymentService.createCardIntent(1, 10);

    expect(result.clientSecret).toBe('cs_refuse');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('payment.service — syncOrderPayment()', () => {
  beforeEach(() => {
    paymentRepository.findLatestIntentId.mockResolvedValue('pi_1');
    orderRepository.markPaidFromWebhook.mockResolvedValue({ statusChanged: true });
    loyaltyService.processOrderEarning.mockResolvedValue();
  });

  test('404 pour la commande d\'une autre cliente', async () => {
    orderRepository.findById.mockResolvedValue(null);

    await expect(paymentService.syncOrderPayment(1, 99)).rejects.toMatchObject({ statusCode: 404 });
    expect(orderRepository.findById).toHaveBeenCalledWith(1, 99);
  });

  test('valide la commande dès le retour de la cliente si Stripe a encaissé, sans attendre le webhook', async () => {
    orderRepository.findById
      .mockResolvedValueOnce(makeOrder({ status: 'awaiting_payment', total: '18.50', payment_method: 'twint' }))
      .mockResolvedValue(makeOrder({ status: 'paid', total: '18.50', payment_method: 'twint' }));
    stripe.paymentIntents = {
      retrieve: jest.fn().mockResolvedValue({
        id: 'pi_1', status: 'succeeded', amount_received: 1850, currency: 'chf',
        payment_method_types: ['twint'], metadata: { order_id: '1' },
      }),
    };

    const result = await paymentService.syncOrderPayment(1, 10);

    expect(orderRepository.markPaidFromWebhook).toHaveBeenCalledWith(1, 'pi_1', 'twint');
    expect(loyaltyService.processOrderEarning).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ orderStatus: 'paid', intentStatus: 'succeeded', paymentMethod: 'twint' });
  });

  test('ne revalide pas une commande déjà payée', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder({ status: 'paid', payment_method: 'card' }));
    stripe.paymentIntents = { retrieve: jest.fn().mockResolvedValue({ id: 'pi_1', status: 'succeeded' }) };

    const result = await paymentService.syncOrderPayment(1, 10);

    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
    expect(result.orderStatus).toBe('paid');
  });

  test('inscrit un refus pas encore signalé par le webhook (CLI-07)', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder({ status: 'awaiting_payment', payment_method: 'card' }));
    stripe.paymentIntents = {
      retrieve: jest.fn().mockResolvedValue({
        id: 'pi_1', status: 'requires_payment_method', payment_method_types: ['card'],
        metadata: { order_id: '1' }, last_payment_error: { decline_code: 'expired_card' },
      }),
    };

    await paymentService.syncOrderPayment(1, 10);

    expect(orderRepository.markPaymentFailed).toHaveBeenCalledWith(1, 'Paiement par carte refusé : carte expirée');
  });

  test('un paiement simplement pas encore tenté ne change rien', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder({ status: 'awaiting_payment', payment_method: 'twint' }));
    stripe.paymentIntents = {
      retrieve: jest.fn().mockResolvedValue({ id: 'pi_1', status: 'requires_payment_method', last_payment_error: null }),
    };

    const result = await paymentService.syncOrderPayment(1, 10);

    expect(orderRepository.markPaymentFailed).not.toHaveBeenCalled();
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
    expect(result).toMatchObject({ orderStatus: 'awaiting_payment', intentStatus: 'requires_payment_method' });
  });

  test('Stripe injoignable : 503, jamais « non payé »', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder({ status: 'awaiting_payment', payment_method: 'twint' }));
    stripe.paymentIntents = { retrieve: jest.fn().mockRejectedValue(new Error('ETIMEDOUT')) };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(paymentService.syncOrderPayment(1, 10)).rejects.toMatchObject({ statusCode: 503 });
    spy.mockRestore();
  });

  test('commande par facture sans QR Twint : rien à demander à Stripe', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder({ status: 'pending_invoice', payment_method: 'invoice_qr' }));
    paymentRepository.findLatestIntentId.mockResolvedValue(null);
    stripe.paymentIntents = { retrieve: jest.fn() };

    const result = await paymentService.syncOrderPayment(1, 10);

    expect(paymentRepository.findLatestIntentId).toHaveBeenCalledWith(1, 'twint');
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(result).toMatchObject({ orderStatus: 'pending_invoice', intentStatus: null });
  });

  /* Audit du 25.09 : une facture réglée par le QR Twint envoyé depuis l'admin
     n'était pas vérifiée au retour — la confirmation disait « Réglez votre
     facture sous 30 jours » à une cliente qui venait de payer. */
  test('commande par facture réglée par QR Twint : validée au retour de la cliente', async () => {
    orderRepository.findById
      .mockResolvedValueOnce(makeOrder({ status: 'pending_invoice', total: '32.50', payment_method: 'invoice_qr' }))
      .mockResolvedValue(makeOrder({ status: 'paid', total: '32.50', payment_method: 'invoice_qr' }));
    stripe.paymentIntents = {
      retrieve: jest.fn().mockResolvedValue({
        id: 'pi_1', status: 'succeeded', amount_received: 3250, currency: 'chf',
        payment_method_types: ['twint'], metadata: { order_id: '1' },
      }),
    };

    const result = await paymentService.syncOrderPayment(1, 10);

    expect(orderRepository.markPaidFromWebhook).toHaveBeenCalledWith(1, 'pi_1', 'twint');
    expect(result).toMatchObject({ orderStatus: 'paid', intentStatus: 'succeeded', paymentMethod: 'invoice_qr' });
  });

  test('commande par facture : un QR Twint refusé ne touche pas à la facture', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder({ status: 'pending_invoice', payment_method: 'invoice_qr' }));
    stripe.paymentIntents = {
      retrieve: jest.fn().mockResolvedValue({
        id: 'pi_1', status: 'requires_payment_method', payment_method_types: ['twint'],
        metadata: { order_id: '1' }, last_payment_error: { code: 'payment_intent_payment_attempt_failed' },
      }),
    };

    const result = await paymentService.syncOrderPayment(1, 10);

    expect(orderRepository.markPaymentFailed).not.toHaveBeenCalled();
    expect(result.orderStatus).toBe('pending_invoice');
  });
});

// ── QR Twint envoyé par e-mail depuis l'admin ─────────────────────────────────

describe('payment.service — createTwintQrForEmail()', () => {
  beforeEach(() => {
    orderRepository.findById.mockResolvedValue(makeOrder({ status: 'pending_invoice', total: '32.50' }));
    paymentRepository.findByOrderIdAndMethod.mockResolvedValue(null);
    paymentRepository.create.mockResolvedValue(7);
    stripe.paymentIntents = {
      create: jest.fn().mockResolvedValue({
        id: 'pi_qr', status: 'requires_action',
        next_action: { redirect_to_url: { url: 'https://pm-redirects.stripe.com/authorize/acct_x/pa_nonce_y' } },
      }),
      cancel: jest.fn().mockResolvedValue({}),
    };
  });

  test('retour sur la page publique /paiement-twint, et lien de paiement renvoyé pour l\'e-mail', async () => {
    const result = await paymentService.createTwintQrForEmail(1);

    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: 3250, return_url: 'http://localhost:5173/paiement-twint',
    }));
    expect(result.payUrl).toBe('https://pm-redirects.stripe.com/authorize/acct_x/pa_nonce_y');
    expect(Buffer.isBuffer(result.qrBuffer)).toBe(true);
    expect(paymentRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'stripe_qr_email', providerPaymentId: 'pi_qr', method: 'twint', status: 'pending',
    }));
  });

  test('le QR précédent est annulé chez Stripe ET marqué annulé', async () => {
    paymentRepository.findByOrderIdAndMethod.mockResolvedValue({ status: 'pending', provider_payment_id: 'pi_old' });

    await paymentService.createTwintQrForEmail(1);

    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith('pi_old');
    expect(paymentRepository.updateStatusByIntentId).toHaveBeenCalledWith('pi_old', 'cancelled');
  });

  test('annulation refusée par Stripe (déjà expiré) : le statut local reste inchangé, le nouveau QR part', async () => {
    paymentRepository.findByOrderIdAndMethod.mockResolvedValue({ status: 'pending', provider_payment_id: 'pi_old' });
    stripe.paymentIntents.cancel.mockRejectedValue(new Error('already canceled'));
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await paymentService.createTwintQrForEmail(1);

    expect(paymentRepository.updateStatusByIntentId).not.toHaveBeenCalled();
    expect(result.payUrl).toBeDefined();
    spy.mockRestore();
  });
});

describe('payment.service — confirmQrPaymentReturn()', () => {
  const qrIntent = (overrides = {}) => ({
    id: 'pi_qr', client_secret: 'pi_qr_secret_abc', status: 'succeeded',
    amount_received: 3250, currency: 'chf', payment_method_types: ['twint'],
    metadata: { order_id: '1' }, ...overrides,
  });

  beforeEach(() => {
    paymentRepository.findByIntentId.mockResolvedValue({ id: 3, order_id: 1, provider: 'stripe_qr_email', method: 'twint', status: 'pending' });
    orderRepository.findById.mockResolvedValue(makeOrder({ status: 'pending_invoice', total: '32.50', payment_method: 'invoice_qr', invoice_number: '2026-09/05' }));
    orderRepository.markPaidFromWebhook.mockResolvedValue({ statusChanged: true });
    loyaltyService.processOrderEarning.mockResolvedValue();
    stripe.paymentIntents = { retrieve: jest.fn().mockResolvedValue(qrIntent()) };
  });

  test('paiement abouti : commande validée sans attendre le webhook, seuls les numéros renvoyés', async () => {
    const result = await paymentService.confirmQrPaymentReturn('pi_qr', 'pi_qr_secret_abc');

    expect(orderRepository.markPaidFromWebhook).toHaveBeenCalledWith(1, 'pi_qr', 'twint');
    expect(result).toEqual({ orderId: 1, invoiceNumber: '2026-09/05', paymentStatus: 'paid' });
  });

  test('secret erroné : 404, rien n\'est validé', async () => {
    await expect(paymentService.confirmQrPaymentReturn('pi_qr', 'pi_qr_secret_zzz'))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
  });

  test('paiement qui n\'est pas un QR envoyé par e-mail (caisse) : 404 sans appel à Stripe', async () => {
    paymentRepository.findByIntentId.mockResolvedValue({ id: 3, order_id: 1, provider: 'stripe', method: 'twint' });

    await expect(paymentService.confirmQrPaymentReturn('pi_qr', 'pi_qr_secret_abc'))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
  });

  test('paiement inconnu : 404 sans appel à Stripe', async () => {
    paymentRepository.findByIntentId.mockResolvedValue(null);

    await expect(paymentService.confirmQrPaymentReturn('pi_nope', 'pi_nope_secret_x'))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
  });

  test.each([
    ['processing', 'processing'],
    ['requires_action', 'processing'],
    ['requires_payment_method', 'failed'],
    ['canceled', 'failed'],
  ])('Stripe « %s » → %s, commande inchangée', async (stripeStatus, expected) => {
    stripe.paymentIntents.retrieve.mockResolvedValue(qrIntent({ status: stripeStatus }));

    const result = await paymentService.confirmQrPaymentReturn('pi_qr', 'pi_qr_secret_abc');

    expect(result).toEqual({ orderId: 1, invoiceNumber: '2026-09/05', paymentStatus: expected });
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
    expect(orderRepository.markPaymentFailed).not.toHaveBeenCalled();
  });

  test('Stripe injoignable : 503', async () => {
    stripe.paymentIntents.retrieve.mockRejectedValue(new Error('ETIMEDOUT'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(paymentService.confirmQrPaymentReturn('pi_qr', 'pi_qr_secret_abc'))
      .rejects.toMatchObject({ statusCode: 503 });
    spy.mockRestore();
  });
});

/* Détail de la transaction dans l'admin (25.09) : ce que la base sait, complété
   par Stripe — moyen exact, encaissement, frais, antifraude, motif de refus. */
describe('paymentService.getOrderTransaction', () => {
  const cardIntent = {
    id: 'pi_card', status: 'succeeded', livemode: true, amount: 4200, amount_received: 4200, currency: 'chf',
    created: 1790330000, payment_method_types: ['card'], last_payment_error: null,
    latest_charge: {
      id: 'ch_1', paid: true, created: 1790330060, amount_refunded: 0, receipt_url: 'https://pay.stripe.com/r/1',
      outcome: { risk_level: 'normal', network_status: 'approved_by_network' },
      payment_method_details: {
        type: 'card',
        card: { brand: 'visa', last4: '4242', exp_month: 4, exp_year: 2028, country: 'CH', wallet: { type: 'apple_pay' }, three_d_secure: { result: 'authenticated' } },
      },
      balance_transaction: { fee: 152, net: 4048, available_on: 1790899200 },
    },
  };

  beforeEach(() => {
    orderRepository.findById.mockResolvedValue({
      id: 7, status: 'paid', total: '42.00', payment_method: 'card', paid_method: 'card',
      paid_at: new Date('2026-09-25T09:00:00Z'), invoice_number: '2026-09/03', qr_reference: null,
    });
    paymentRepository.findAllByOrderId = jest.fn().mockResolvedValue([
      // Réservation créée avec la commande, avant l'appel à Stripe : pas une tentative
      { id: 1, provider: 'stripe', provider_payment_id: null, method: 'card', status: 'pending', amount: '42.00', created_at: new Date() },
      { id: 2, provider: 'stripe', provider_payment_id: 'pi_card', method: 'card', status: 'succeeded', amount: '42.00', created_at: new Date() },
    ]);
  });

  test('carte encaissée : marque, 4 derniers chiffres, frais, net, antifraude et liens Stripe', async () => {
    stripe.paymentIntents = { retrieve: jest.fn().mockResolvedValue(cardIntent) };

    const t = await paymentService.getOrderTransaction(7);

    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_card', { expand: ['latest_charge.balance_transaction'] }, { timeout: 8000 });
    expect(t.status).toBe('paid');
    expect(t.attempts).toHaveLength(1);
    expect(t.stripe).toMatchObject({
      intent_id: 'pi_card', charge_id: 'ch_1', amount_received: 42, fee: 1.52, net: 40.48,
      risk_level: 'normal', network_status: 'approved_by_network',
      card: { brand: 'Visa', last4: '4242', wallet: 'Apple Pay', three_d_secure: 'authenticated' },
      dashboard_url: 'https://dashboard.stripe.com/payments/pi_card',
      receipt_url: 'https://pay.stripe.com/r/1',
    });
  });

  test('paiement refusé : motif en français, jamais le message anglais de Stripe', async () => {
    orderRepository.findById.mockResolvedValue({ id: 7, status: 'payment_failed', total: '42.00', payment_method: 'card', paid_at: null });
    stripe.paymentIntents = {
      retrieve: jest.fn().mockResolvedValue({
        ...cardIntent, status: 'requires_payment_method', amount_received: 0, latest_charge: null,
        last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds', message: 'Your card has insufficient funds.' },
      }),
    };

    const t = await paymentService.getOrderTransaction(7);

    expect(t.status).toBe('failed');
    expect(t.stripe.last_error).toEqual({ code: 'insufficient_funds', reason: 'fonds insuffisants' });
  });

  test('Stripe injoignable : le signale sans échouer, avec les données de la boutique', async () => {
    stripe.paymentIntents = { retrieve: jest.fn().mockRejectedValue(new Error('timeout')) };

    const t = await paymentService.getOrderTransaction(7);

    expect(t.stripe).toBeNull();
    expect(t.stripe_unavailable).toBe(true);
    expect(t).toMatchObject({ status: 'paid', method: 'card', attempts: [expect.objectContaining({ reference: 'pi_card' })] });
  });

  test('commande inconnue : 404', async () => {
    orderRepository.findById.mockResolvedValue(null);
    await expect(paymentService.getOrderTransaction(999)).rejects.toMatchObject({ statusCode: 404 });
  });
});
