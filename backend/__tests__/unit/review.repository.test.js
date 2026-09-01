// Tests unitaires review.repository — pool mocké

jest.mock('../../config/db', () => ({
  pool: {
    execute: jest.fn(),
    query:   jest.fn(),
  },
}));

const { pool } = require('../../config/db');
const repo     = require('../../repositories/review.repository');

beforeEach(() => jest.clearAllMocks());

// ── findApprovedByProduct() ───────────────────────────────────────────────────

describe('review.repository — findApprovedByProduct()', () => {
  test('retourne les avis paginés d\'un produit', async () => {
    pool.execute.mockResolvedValue([[{ total: 2 }]]);
    pool.query.mockResolvedValue([[
      { id: 1, rating: 5, title: 'Super', first_name: 'Julie' },
      { id: 2, rating: 4, title: 'Bien',  first_name: 'Marc' },
    ]]);

    const result = await repo.findApprovedByProduct(1, { page: 1, limit: 20 });
    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('is_approved = 1'), [1]
    );
  });

  test('retourne 0 avis si produit sans avis approuvés', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    const result = await repo.findApprovedByProduct(99, { page: 1, limit: 20 });
    expect(result.total).toBe(0);
    expect(result.rows).toHaveLength(0);
  });
});

// ── findApproved() ────────────────────────────────────────────────────────────

describe('review.repository — findApproved()', () => {
  test('retourne les avis approuvés récents sans filtre rating', async () => {
    pool.query.mockResolvedValue([[
      { id: 1, rating: 5 }, { id: 2, rating: 4 }, { id: 3, rating: 5 },
    ]]);

    const result = await repo.findApproved({ limit: 3 });
    expect(result).toHaveLength(3);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('is_approved = 1'),
      [3]
    );
  });

  test('filtre par rating si fourni', async () => {
    pool.query.mockResolvedValue([[{ id: 1, rating: 5 }]]);

    await repo.findApproved({ limit: 5, rating: 5 });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('r.rating = ?'),
      [5, 5]
    );
  });
});

// ── findAll() (admin) ─────────────────────────────────────────────────────────

describe('review.repository — findAll()', () => {
  test('retourne tous les avis paginés sans filtre', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 5 }]])
      .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]);

    const result = await repo.findAll({ page: 1, limit: 20 });
    expect(result.total).toBe(5);
    expect(result.rows).toHaveLength(2);
  });

  test('filtre les avis approuvés (approved=true)', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 2 }]])
      .mockResolvedValueOnce([[{ id: 1, is_approved: 1 }]]);

    await repo.findAll({ page: 1, limit: 20, approved: true });
    const countCall = pool.query.mock.calls[0];
    expect(countCall[1]).toContain(1);
  });

  test('filtre les avis en attente (approved=false)', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ id: 3, is_approved: 0 }]]);

    await repo.findAll({ page: 1, limit: 20, approved: false });
    const countCall = pool.query.mock.calls[0];
    expect(countCall[1]).toContain(0);
  });
});

// ── create() ─────────────────────────────────────────────────────────────────

describe('review.repository — create()', () => {
  test('insère un avis non approuvé et retourne l\'id', async () => {
    pool.execute.mockResolvedValue([{ insertId: 7 }]);

    const id = await repo.create({
      userId: 1, productId: 2, rating: 5, title: 'Parfait', body: 'Super qualité',
    });

    expect(id).toBe(7);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('is_approved)'),
      expect.arrayContaining([1, 2, 5, 'Parfait', 'Super qualité'])
    );
  });

  test('stocke null pour title/body si non fournis', async () => {
    pool.execute.mockResolvedValue([{ insertId: 8 }]);

    await repo.create({ userId: 1, productId: 3, rating: 3 });

    expect(pool.execute).toHaveBeenCalledWith(
      expect.anything(),
      [1, 3, 3, null, null]
    );
  });
});

// ── approve() ────────────────────────────────────────────────────────────────

describe('review.repository — approve()', () => {
  test('passe is_approved à 1 puis recalcule la note du produit', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ product_id: 42 }]]) // SELECT product_id
      .mockResolvedValueOnce([{}])                    // UPDATE reviews
      .mockResolvedValueOnce([{}]);                   // UPDATE products (recompute)
    await repo.approve(5);

    const calls = pool.execute.mock.calls.map((c) => c[0]);
    expect(calls.some((sql) => /SET is_approved = 1/.test(sql))).toBe(true);
    expect(calls.some((sql) => /UPDATE products p[\s\S]*rating_avg/.test(sql))).toBe(true);
  });
});

// ── remove() ─────────────────────────────────────────────────────────────────

describe('review.repository — remove()', () => {
  test('supprime, retourne true et recalcule la note du produit', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ product_id: 42 }]])  // SELECT product_id
      .mockResolvedValueOnce([{ affectedRows: 1 }])   // DELETE
      .mockResolvedValueOnce([{}]);                   // UPDATE products (recompute)
    expect(await repo.remove(3)).toBe(true);
    const calls = pool.execute.mock.calls.map((c) => c[0]);
    expect(calls.some((sql) => /UPDATE products p[\s\S]*rating_avg/.test(sql))).toBe(true);
  });

  test('retourne false si avis inexistant (pas de recompute)', async () => {
    pool.execute
      .mockResolvedValueOnce([[]])                    // SELECT product_id → rien
      .mockResolvedValueOnce([{ affectedRows: 0 }]);  // DELETE
    expect(await repo.remove(999)).toBe(false);
  });
});

// ── recomputeProductRating() ─────────────────────────────────────────────────

describe('review.repository — recomputeProductRating()', () => {
  test('met à jour rating_avg et rating_count depuis les avis approuvés', async () => {
    pool.execute.mockResolvedValue([{}]);
    await repo.recomputeProductRating(7);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE products p[\s\S]*rating_avg[\s\S]*rating_count/),
      [7, 7, 7]
    );
  });
});

// ── hasPurchased() ────────────────────────────────────────────────────────────

describe('review.repository — hasPurchased()', () => {
  test('retourne true si une commande "achetée" contient le produit', async () => {
    pool.execute.mockResolvedValue([[{ 1: 1 }]]);
    const ok = await repo.hasPurchased(3, 10);
    expect(ok).toBe(true);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringMatching(/order_items[\s\S]*o\.status IN \('paid', 'processing', 'shipped', 'delivered'\)/),
      [10, 3]
    );
  });

  test('retourne false si aucune commande éligible', async () => {
    pool.execute.mockResolvedValue([[]]);
    expect(await repo.hasPurchased(3, 10)).toBe(false);
  });
});
