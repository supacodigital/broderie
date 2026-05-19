// Tests unitaires payment.repository — pool mocké

jest.mock('../../config/db', () => ({
  pool: { execute: jest.fn() },
}));

const { pool } = require('../../config/db');
const repo     = require('../../repositories/payment.repository');

beforeEach(() => jest.clearAllMocks());

// ── create() ─────────────────────────────────────────────────────────────────

describe('payment.repository — create()', () => {
  test('insère un paiement et retourne l\'insertId', async () => {
    pool.execute.mockResolvedValue([{ insertId: 11 }]);

    const id = await repo.create({
      orderId: 1, provider: 'stripe', providerPaymentId: 'pi_test',
      amount: '58.40', method: 'card', status: 'pending',
    });

    expect(id).toBe(11);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO payments'),
      [1, 'stripe', 'pi_test', '58.40', 'card', 'pending']
    );
  });

  test('utilise "internal" si provider non fourni', async () => {
    pool.execute.mockResolvedValue([{ insertId: 12 }]);
    await repo.create({ orderId: 2, amount: '20.00', method: 'invoice', status: 'pending' });
    expect(pool.execute).toHaveBeenCalledWith(
      expect.anything(),
      [2, 'internal', null, '20.00', 'invoice', 'pending']
    );
  });

  test('utilise "pending" comme statut par défaut', async () => {
    pool.execute.mockResolvedValue([{ insertId: 13 }]);
    await repo.create({ orderId: 3, provider: 'stripe', amount: '10.00', method: 'twint' });
    const params = pool.execute.mock.calls[0][1];
    expect(params[5]).toBe('pending');
  });
});

// ── updateStatusByOrder() ─────────────────────────────────────────────────────

describe('payment.repository — updateStatusByOrder()', () => {
  test('met à jour le statut avec provider_payment_id', async () => {
    pool.execute.mockResolvedValue([{}]);
    await repo.updateStatusByOrder(1, 'card', 'succeeded', 'pi_confirmed');
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE payments SET status = ?'),
      ['succeeded', 'pi_confirmed', 1, 'card']
    );
  });

  test('met à jour le statut sans changer provider_payment_id (null)', async () => {
    pool.execute.mockResolvedValue([{}]);
    await repo.updateStatusByOrder(2, 'twint', 'failed');
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('COALESCE(?, provider_payment_id)'),
      ['failed', null, 2, 'twint']
    );
  });
});

// ── findByOrderId() ───────────────────────────────────────────────────────────

describe('payment.repository — findByOrderId()', () => {
  test('retourne le dernier paiement d\'une commande', async () => {
    const fakePayment = { id: 5, order_id: 1, method: 'card', status: 'succeeded' };
    pool.execute.mockResolvedValue([[fakePayment]]);

    const result = await repo.findByOrderId(1);
    expect(result).toEqual(fakePayment);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY created_at DESC LIMIT 1'), [1]
    );
  });

  test('retourne null si aucun paiement pour cette commande', async () => {
    pool.execute.mockResolvedValue([[]]);
    expect(await repo.findByOrderId(99)).toBeNull();
  });
});
