// Tests unitaires payment.service — stripe, repositories et services externes mockés

// Mock stripe comme un objet (jamais null) pour pouvoir surcharger ses méthodes par test
jest.mock('../../config/stripe', () => ({
  paymentIntents: {},
  paymentMethods: {},
  webhooks: {},
}));

jest.mock('../../repositories/payment.repository');
jest.mock('../../repositories/order.repository');
jest.mock('../../repositories/user.repository');
jest.mock('../../services/email.service');
jest.mock('../../services/loyalty.service');
jest.mock('../../config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../config/env', () => ({
  stripeWebhookSecret: 'whsec_test',
  clientUrl: 'http://localhost:5173',
  nodeEnv: 'test',
}));

const stripe            = require('../../config/stripe');
const paymentRepository = require('../../repositories/payment.repository');
const orderRepository   = require('../../repositories/order.repository');
const userRepository    = require('../../repositories/user.repository');
const loyaltyService    = require('../../services/loyalty.service');
const { pool }          = require('../../config/db');
const paymentService    = require('../../services/payment.service');

beforeEach(() => jest.clearAllMocks());

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

function makeUser(overrides = {}) {
  return { id: 10, email: 'client@broderie.ch', first_name: 'Julie', ...overrides };
}

function makeConnection() {
  return {
    beginTransaction: jest.fn().mockResolvedValue(),
    execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
    commit: jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
  };
}

// ── createCardIntent() ────────────────────────────────────────────────────────

describe('payment.service — createCardIntent()', () => {
  test('lève 404 si commande introuvable', async () => {
    orderRepository.findById.mockResolvedValue(null);

    await expect(paymentService.createCardIntent(99)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('lève 400 si commande déjà payée', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder({ status: 'paid' }));

    await expect(paymentService.createCardIntent(1)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('lève 400 si statut commande invalide (shipped)', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder({ status: 'shipped' }));

    await expect(paymentService.createCardIntent(1)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('crée un PaymentIntent et retourne clientSecret + amount (sans paiement existant)', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder());
    stripe.paymentIntents = {
      create: jest.fn().mockResolvedValue({ id: 'pi_test', client_secret: 'cs_test' }),
    };
    paymentRepository.findByOrderId.mockResolvedValue(null);
    paymentRepository.create.mockResolvedValue();

    const result = await paymentService.createCardIntent(1);

    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining({
      currency: 'chf',
      payment_method_types: ['card'],
    }));
    expect(paymentRepository.create).toHaveBeenCalled();
    expect(result.clientSecret).toBe('cs_test');
    expect(result.amount).toBe('58.40');
  });

  test('met à jour le paiement existant au lieu d\'en créer un nouveau', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder());
    stripe.paymentIntents = {
      create: jest.fn().mockResolvedValue({ id: 'pi_test2', client_secret: 'cs_test2' }),
    };
    paymentRepository.findByOrderId.mockResolvedValue({ id: 5, status: 'pending' });
    paymentRepository.updateStatusByOrder.mockResolvedValue();

    await paymentService.createCardIntent(1);

    expect(paymentRepository.updateStatusByOrder).toHaveBeenCalledWith(1, 'card', 'pending', 'pi_test2');
    expect(paymentRepository.create).not.toHaveBeenCalled();
  });

  test('fonctionne aussi avec statut awaiting_payment', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder({ status: 'awaiting_payment' }));
    stripe.paymentIntents = {
      create: jest.fn().mockResolvedValue({ id: 'pi_aw', client_secret: 'cs_aw' }),
    };
    paymentRepository.findByOrderId.mockResolvedValue(null);
    paymentRepository.create.mockResolvedValue();

    const result = await paymentService.createCardIntent(1);
    expect(result.clientSecret).toBe('cs_aw');
  });
});

// ── createTwintIntent() ───────────────────────────────────────────────────────

describe('payment.service — createTwintIntent()', () => {
  test('lève 404 si commande introuvable', async () => {
    orderRepository.findById.mockResolvedValue(null);

    await expect(paymentService.createTwintIntent(99)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('lève 400 si statut commande invalide', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder({ status: 'shipped' }));

    await expect(paymentService.createTwintIntent(1)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('retourne le client_secret (Twint sans QR — redirection Stripe.js)', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder());
    paymentRepository.findByOrderId.mockResolvedValue(null);
    stripe.paymentIntents = {
      create: jest.fn().mockResolvedValue({ id: 'pi_twint', client_secret: 'cs_twint' }),
    };
    paymentRepository.create.mockResolvedValue();

    const result = await paymentService.createTwintIntent(1);

    expect(result.clientSecret).toBe('cs_twint');
    expect(result.amount).toBeDefined();
    // Plus de QR généré côté serveur
    expect(result.qrUrl).toBeUndefined();
  });

  test('crée le PaymentIntent avec le type twint et l\'order_id en metadata', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder());
    paymentRepository.findByOrderId.mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ id: 'pi_twint', client_secret: 'cs_twint' });
    stripe.paymentIntents = { create };
    paymentRepository.create.mockResolvedValue();

    await paymentService.createTwintIntent(1);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      currency: 'chf',
      payment_method_types: ['twint'],
      metadata: { order_id: '1' },
    }));
  });

  test('met à jour le paiement existant au lieu d\'en créer un nouveau', async () => {
    orderRepository.findById.mockResolvedValue(makeOrder());
    paymentRepository.findByOrderId.mockResolvedValue({ id: 3, provider_payment_id: 'pi_old', status: 'pending' });
    stripe.paymentIntents = {
      create: jest.fn().mockResolvedValue({ id: 'pi_new', client_secret: 'cs_new' }),
    };
    paymentRepository.updateStatusByOrder.mockResolvedValue();

    await paymentService.createTwintIntent(1);

    expect(paymentRepository.updateStatusByOrder).toHaveBeenCalledWith(1, 'twint', 'pending', 'pi_new');
  });
});

// ── handleWebhook() ───────────────────────────────────────────────────────────

describe('payment.service — handleWebhook()', () => {
  test('lève 400 si signature invalide', async () => {
    stripe.webhooks = {
      constructEvent: jest.fn().mockImplementation(() => { throw new Error('bad sig'); }),
    };

    await expect(paymentService.handleWebhook('raw', 'bad')).rejects.toMatchObject({ statusCode: 400 });
  });

  test('ignore les événements inconnus sans erreur', async () => {
    stripe.webhooks = {
      constructEvent: jest.fn().mockReturnValue({ type: 'customer.created', data: { object: {} } }),
    };

    await expect(paymentService.handleWebhook('raw', 'sig')).resolves.toBeUndefined();
  });

  test('met à jour la commande en "paid" pour payment_intent.succeeded', async () => {
    const conn = makeConnection();
    pool.getConnection = jest.fn().mockResolvedValue(conn);

    stripe.webhooks = {
      constructEvent: jest.fn().mockReturnValue({
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_ok',
            metadata: { order_id: '1' },
            payment_method_types: ['card'],
          },
        },
      }),
    };

    orderRepository.findById.mockResolvedValue(makeOrder({ status: 'paid' }));
    userRepository.findById.mockResolvedValue(makeUser());
    loyaltyService.processOrderEarning.mockResolvedValue();

    await paymentService.handleWebhook('raw', 'sig');

    expect(conn.execute).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'paid'"),
      [1]
    );
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test('rollback si erreur dans la transaction', async () => {
    const conn = makeConnection();
    conn.execute.mockRejectedValueOnce(new Error('SQL error'));
    pool.getConnection = jest.fn().mockResolvedValue(conn);

    stripe.webhooks = {
      constructEvent: jest.fn().mockReturnValue({
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_fail',
            metadata: { order_id: '1' },
            payment_method_types: ['twint'],
          },
        },
      }),
    };

    await expect(paymentService.handleWebhook('raw', 'sig')).rejects.toThrow('SQL error');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test('met à jour le statut en "failed" pour payment_intent.payment_failed', async () => {
    stripe.webhooks = {
      constructEvent: jest.fn().mockReturnValue({
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_fail',
            metadata: { order_id: '2' },
            payment_method_types: ['twint'],
          },
        },
      }),
    };
    paymentRepository.updateStatusByOrder.mockResolvedValue();

    await paymentService.handleWebhook('raw', 'sig');

    expect(paymentRepository.updateStatusByOrder).toHaveBeenCalledWith(2, 'twint', 'failed');
  });

  test('ignore payment_intent.succeeded sans order_id dans metadata', async () => {
    stripe.webhooks = {
      constructEvent: jest.fn().mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_no_order', metadata: {}, payment_method_types: ['card'] } },
      }),
    };

    await expect(paymentService.handleWebhook('raw', 'sig')).resolves.toBeUndefined();
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  test('détermine la méthode "twint" depuis payment_method_types', async () => {
    const conn = makeConnection();
    pool.getConnection = jest.fn().mockResolvedValue(conn);

    stripe.webhooks = {
      constructEvent: jest.fn().mockReturnValue({
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_twint_ok',
            metadata: { order_id: '3' },
            payment_method_types: ['twint'],
          },
        },
      }),
    };

    orderRepository.findById.mockResolvedValue(makeOrder({ id: 3, status: 'paid' }));
    userRepository.findById.mockResolvedValue(makeUser());
    loyaltyService.processOrderEarning.mockResolvedValue();

    await paymentService.handleWebhook('raw', 'sig');

    // La 3ème execute est la mise à jour du paiement avec method='twint'
    const thirdCall = conn.execute.mock.calls[2];
    expect(thirdCall[1]).toContain('twint');
  });
});
