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
  test('passe is_approved à 1', async () => {
    pool.execute.mockResolvedValue([{}]);
    await repo.approve(5);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('SET is_approved = 1'), [5]
    );
  });
});

// ── remove() ─────────────────────────────────────────────────────────────────

describe('review.repository — remove()', () => {
  test('supprime et retourne true si avis trouvé', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 1 }]);
    expect(await repo.remove(3)).toBe(true);
  });

  test('retourne false si avis inexistant', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 0 }]);
    expect(await repo.remove(999)).toBe(false);
  });
});
