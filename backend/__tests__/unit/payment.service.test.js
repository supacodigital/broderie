// Tests unitaires payment.service — stripe, repositories et services externes mockés

// Mock stripe comme un objet (jamais null) pour pouvoir surcharger ses méthodes par test
jest.mock('../../config/stripe', () => ({
  paymentIntents: {},
  paymentMethods: {},
  webhooks: {},
}));

jest.mock('../../repositories/payment.repository');
jest.mock('../../repositories/order.repository');
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

const mockEvent = (obj) => {
  stripe.webhooks = {
    constructEvent: jest.fn().mockReturnValue({
      id: obj.id ?? `evt_${Math.random().toString(36).slice(2)}`,
      type: obj.type,
      data: { object: obj.data },
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

  test('ignore payment_intent.succeeded sans order_id dans metadata', async () => {
    mockEvent({ type: 'payment_intent.succeeded',
      data: { id: 'pi_no_order', metadata: {}, payment_method_types: ['card'] } });

    await paymentService.handleWebhook('raw', 'sig');
    expect(orderRepository.markPaidFromWebhook).not.toHaveBeenCalled();
  });
});
