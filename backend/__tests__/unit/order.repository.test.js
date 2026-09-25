// Tests unitaires order.repository — pool mocké

jest.mock('../../config/db', () => ({
  pool: { execute: jest.fn(), query: jest.fn(), getConnection: jest.fn() },
}));

const { pool } = require('../../config/db');
const repo = require('../../repositories/order.repository');

beforeEach(() => jest.clearAllMocks());

const makeConn = () => ({
  beginTransaction: jest.fn().mockResolvedValue(),
  execute:          jest.fn(),
  commit:           jest.fn().mockResolvedValue(),
  rollback:         jest.fn().mockResolvedValue(),
  release:          jest.fn(),
});

// ── updateStatusWithHistory() ─────────────────────────────────────────────────

describe('order.repository — updateStatusWithHistory()', () => {
  test('met à jour le statut + insère l\'historique, commit, release', async () => {
    const conn = makeConn();
    conn.execute
      .mockResolvedValueOnce([[{ id: 42, status: 'processing' }]])  // SELECT ... FOR UPDATE
      .mockResolvedValueOnce([{}])             // UPDATE orders
      .mockResolvedValueOnce([{}]);            // INSERT history
    pool.getConnection.mockResolvedValue(conn);

    const res = await repo.updateStatusWithHistory(42, 'shipped', 'Colis remis', 1);

    expect(res.ok).toBe(true);
    expect(res.previousStatus).toBe('processing');
    expect(res.stockRestored).toBe(false);
    const calls = conn.execute.mock.calls.map((c) => c[0]);
    expect(calls.some((s) => /UPDATE orders SET status/.test(s))).toBe(true);
    expect(calls.some((s) => /INSERT INTO order_status_history/.test(s))).toBe(true);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test('restitue le stock quand la commande passe à cancelled', async () => {
    const conn = makeConn();
    conn.execute
      .mockResolvedValueOnce([[{ id: 7, status: 'pending_invoice' }]]) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce([{}])   // UPDATE products (restitution)
      .mockResolvedValueOnce([{}])   // UPDATE orders
      .mockResolvedValueOnce([{}]);  // INSERT history
    pool.getConnection.mockResolvedValue(conn);

    const res = await repo.updateStatusWithHistory(7, 'cancelled', 'Facture impayée', 1);

    expect(res.stockRestored).toBe(true);
    expect(res.previousStatus).toBe('pending_invoice');
    const calls = conn.execute.mock.calls.map((c) => c[0]);
    /* Chaque ligne rend ce qu'elle a retiré (ADM-12 : centimètres pour la
       coupe) ; les lignes antérieures retombent sur `quantity`. */
    const restore = calls.find((s) => /SET p\.stock = p\.stock \+ COALESCE\(oi\.stock_units, oi\.quantity\)/.test(s));
    expect(restore).toBeDefined();
    // Les produits « sur commande » n'ont jamais été décrémentés : ne pas les regonfler
    expect(restore).toMatch(/oi\.stock_units IS NOT NULL OR p\.is_made_to_order = 0/);
    expect(conn.commit).toHaveBeenCalled();
  });

  test('ne restitue PAS le stock deux fois (cancelled → refunded)', async () => {
    const conn = makeConn();
    conn.execute
      .mockResolvedValueOnce([[{ id: 8, status: 'cancelled' }]]) // déjà annulée
      .mockResolvedValueOnce([{}])   // UPDATE orders
      .mockResolvedValueOnce([{}]);  // INSERT history
    pool.getConnection.mockResolvedValue(conn);

    const res = await repo.updateStatusWithHistory(8, 'refunded', null, 1);

    expect(res.stockRestored).toBe(false);
    const calls = conn.execute.mock.calls.map((c) => c[0]);
    expect(calls.some((s) => /p\.stock \+ oi\.quantity/.test(s))).toBe(false);
  });

  test('retourne ok=false + rollback si la commande n\'existe pas', async () => {
    const conn = makeConn();
    conn.execute.mockResolvedValueOnce([[]]); // SELECT vide
    pool.getConnection.mockResolvedValue(conn);

    const res = await repo.updateStatusWithHistory(999, 'paid', null, 1);

    expect(res.ok).toBe(false);
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  test('rollback + rethrow si une requête échoue', async () => {
    const conn = makeConn();
    conn.execute
      .mockResolvedValueOnce([[{ id: 1, status: 'pending' }]])
      .mockRejectedValueOnce(new Error('boom'));
    pool.getConnection.mockResolvedValue(conn);

    await expect(repo.updateStatusWithHistory(1, 'paid', null, 1)).rejects.toThrow('boom');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});

// ── markPaidFromWebhook() ────────────────────────────────────────────────────

describe('order.repository — markPaidFromWebhook()', () => {
  /* Base simulée : la commande change (ou non) de statut, et une ligne de
     paiement porte (ou non) l'identifiant du paiement encaissé. */
  const scriptedConn = ({ orderUpdated, paidRowId }) => {
    const conn = makeConn();
    conn.execute.mockImplementation((sql) => {
      if (/^UPDATE orders/.test(sql)) return Promise.resolve([{ affectedRows: orderUpdated ? 1 : 0 }]);
      if (/SELECT id FROM payments/.test(sql)) return Promise.resolve([paidRowId ? [{ id: paidRowId }] : []]);
      return Promise.resolve([{ affectedRows: 1 }]);
    });
    return conn;
  };
  const sqlCalls = (conn) => conn.execute.mock.calls.map((c) => [c[0].replace(/\s+/g, ' '), c[1]]);

  test('statusChanged=true : historique inséré + paiement mis à jour', async () => {
    const conn = scriptedConn({ orderUpdated: true, paidRowId: 5 });
    pool.getConnection.mockResolvedValue(conn);

    const res = await repo.markPaidFromWebhook(1, 'pi_123', 'card');

    expect(res).toEqual({ statusChanged: true });
    const calls = sqlCalls(conn);
    expect(calls.some(([s]) => /INSERT INTO order_status_history/.test(s))).toBe(true);
    expect(calls).toContainEqual(["UPDATE payments SET status = 'succeeded' WHERE id = ?", [5]]);
    expect(conn.commit).toHaveBeenCalled();
  });

  test('statusChanged=false (déjà payée) : pas d\'historique, paiement quand même mis à jour', async () => {
    const conn = scriptedConn({ orderUpdated: false, paidRowId: 5 });
    pool.getConnection.mockResolvedValue(conn);

    const res = await repo.markPaidFromWebhook(1, 'pi_123', 'twint');

    expect(res).toEqual({ statusChanged: false });
    const calls = sqlCalls(conn);
    expect(calls.some(([s]) => /INSERT INTO order_status_history/.test(s))).toBe(false);
    expect(calls).toContainEqual(["UPDATE payments SET status = 'succeeded' WHERE id = ?", [5]]);
  });

  /* Audit du 25.09 : toutes les lignes de la méthode passaient à « réussi » — un
     QR Twint remplacé, donc annulé chez Stripe, apparaissait lui aussi payé. */
  test('seule la ligne du paiement encaissé est visée', async () => {
    const conn = scriptedConn({ orderUpdated: true, paidRowId: 5 });
    pool.getConnection.mockResolvedValue(conn);

    await repo.markPaidFromWebhook(1, 'pi_123', 'twint');

    const updates = sqlCalls(conn).filter(([s]) => /^UPDATE payments/.test(s));
    expect(updates).toHaveLength(1);
    expect(updates[0][0]).toMatch(/WHERE id = \?$/);
  });

  test('aucune ligne ne porte ce paiement : la dernière réservation sans identifiant le reçoit', async () => {
    const conn = scriptedConn({ orderUpdated: true, paidRowId: null });
    pool.getConnection.mockResolvedValue(conn);

    await repo.markPaidFromWebhook(1, 'pi_123', 'card');

    const [update] = sqlCalls(conn).filter(([s]) => /^UPDATE payments/.test(s));
    expect(update[0]).toMatch(/provider_payment_id IS NULL/);
    expect(update[0]).toMatch(/LIMIT 1$/);
    expect(update[1]).toEqual(['pi_123', 1, 'card']);
  });
});

// ── createOrder() — TOCTOU coupon ────────────────────────────────────────────

describe('order.repository — createOrder() coupon FOR UPDATE', () => {
  const baseArgs = {
    userId: 1, items: [{ product_id: 1, quantity: 1, price_snapshot: '10.00', tax_rate_snapshot: '8.10',
      is_active: 1, deleted_at: null }],
    subtotal: 10, shippingCost: 8.5, taxAmount: 0.75, total: 18.5,
    address: { first_name: 'A', last_name: 'B', street: 'R', city: 'L', zip: '1000', canton: 'VD', country: 'CH' },
    couponId: 7,
  };

  const scriptedConn = (couponRow) => {
    const conn = makeConn();
    let call = 0;
    conn.execute.mockImplementation((sql) => {
      call += 1;
      if (/FROM products WHERE id = \? AND is_active/.test(sql)) return Promise.resolve([[{ stock: 5, is_made_to_order: 0 }]]);
      if (/INSERT INTO orders/.test(sql)) return Promise.resolve([{ insertId: 99 }]);
      if (/SELECT p\.price_chf/.test(sql)) return Promise.resolve([[{ price_chf: '10.00', name: 'X', sku: 'S', description: null }]]);
      if (/SELECT usage_limit, used_count FROM coupons WHERE id = \? FOR UPDATE/.test(sql)) return Promise.resolve([[couponRow]]);
      return Promise.resolve([{ affectedRows: 1, insertId: call }]);
    });
    return conn;
  };

  test('409 si le coupon a atteint sa limite entre validation et commande', async () => {
    const conn = scriptedConn({ usage_limit: 5, used_count: 5 });
    pool.getConnection.mockResolvedValue(conn);

    await expect(repo.createOrder(baseArgs)).rejects.toMatchObject({ statusCode: 409 });
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('incrémente used_count si le coupon a encore de la marge', async () => {
    const conn = scriptedConn({ usage_limit: 5, used_count: 2 });
    pool.getConnection.mockResolvedValue(conn);

    const id = await repo.createOrder(baseArgs);
    expect(id).toBe(99);
    const calls = conn.execute.mock.calls.map((c) => c[0]);
    expect(calls.some((s) => /UPDATE coupons SET used_count = used_count \+ 1/.test(s))).toBe(true);
    expect(conn.commit).toHaveBeenCalled();
  });
});

// ── saveShippingLabel() / updateTrackingNumber() ─────────────────────────────

describe('order.repository — saveShippingLabel()', () => {
  test('écrit tracking_number, label_url, label_id', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 1 }]);
    const ok = await repo.saveShippingLabel(5, { trackingNumber: 'T1', labelUrl: 'u', labelId: 'i' });
    expect(ok).toBe(true);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE orders SET tracking_number = \?, label_url = \?, label_id = \?/),
      ['T1', 'u', 'i', 5]
    );
  });
});

describe('order.repository — updateTrackingNumber()', () => {
  test('retourne true si une ligne est modifiée', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 1 }]);
    expect(await repo.updateTrackingNumber(5, 'T2')).toBe(true);
  });
  test('retourne false si aucune ligne', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 0 }]);
    expect(await repo.updateTrackingNumber(999, 'T2')).toBe(false);
  });
});
