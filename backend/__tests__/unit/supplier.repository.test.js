// Tests unitaires supplier.repository — pool mocké

jest.mock('../../config/db', () => ({
  pool: {
    execute: jest.fn(),
    query:   jest.fn(),
  },
}));

const { pool } = require('../../config/db');
const repo     = require('../../repositories/supplier.repository');

beforeEach(() => jest.clearAllMocks());

const fakeSupplier = {
  id: 1, name: 'DMC SA', contact_name: 'Pierre', email: 'dmc@broderie.ch',
  phone: '+41 21 000 00 00', address: 'Rue A, Lausanne', notes: null, is_active: 1,
};

// ── findAll() ────────────────────────────────────────────────────────────────

describe('supplier.repository — findAll()', () => {
  test('retourne tous les fournisseurs paginés sans filtre', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 2 }]])
      .mockResolvedValueOnce([[fakeSupplier, { ...fakeSupplier, id: 2 }]]);

    const result = await repo.findAll({ page: 1, limit: 20 });
    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(2);
  });

  test('filtre par search (nom, contact, email)', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[fakeSupplier]]);

    await repo.findAll({ page: 1, limit: 20, search: 'dmc' });
    const countCall = pool.query.mock.calls[0];
    expect(countCall[1]).toContain('%dmc%');
  });
});

// ── findById() ───────────────────────────────────────────────────────────────

describe('supplier.repository — findById()', () => {
  test('retourne le fournisseur par id', async () => {
    pool.execute.mockResolvedValue([[fakeSupplier]]);
    const result = await repo.findById(1);
    expect(result).toEqual(fakeSupplier);
  });

  test('retourne null si introuvable', async () => {
    pool.execute.mockResolvedValue([[]]);
    expect(await repo.findById(99)).toBeNull();
  });
});

// ── create() ────────────────────────────────────────────────────────────────

describe('supplier.repository — create()', () => {
  test('insère et retourne l\'insertId', async () => {
    pool.execute.mockResolvedValue([{ insertId: 4 }]);

    const id = await repo.create({
      name: 'Anchor', contactName: 'Anne', email: 'anchor@ch',
      phone: null, address: null, notes: null,
    });

    expect(id).toBe(4);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO suppliers'),
      expect.arrayContaining(['Anchor', 'Anne', 'anchor@ch'])
    );
  });

  test('stocke null pour les champs optionnels manquants', async () => {
    pool.execute.mockResolvedValue([{ insertId: 5 }]);
    await repo.create({ name: 'Mini' });
    expect(pool.execute).toHaveBeenCalledWith(
      expect.anything(),
      ['Mini', null, null, null, null, null, null, null]
    );
  });
});

// ── update() ────────────────────────────────────────────────────────────────

describe('supplier.repository — update()', () => {
  test('met à jour et retourne le fournisseur mis à jour', async () => {
    pool.execute
      .mockResolvedValueOnce([{}])               // UPDATE
      .mockResolvedValueOnce([[fakeSupplier]]);   // findById

    const result = await repo.update(1, {
      name: 'DMC SA', contactName: 'Pierre', email: 'dmc@broderie.ch',
      phone: null, address: null, notes: null, isActive: true,
    });

    expect(result).toEqual(fakeSupplier);
    expect(pool.execute).toHaveBeenNthCalledWith(1,
      expect.stringContaining('UPDATE suppliers SET'),
      expect.arrayContaining(['DMC SA', 1, 1])
    );
  });
});

// ── remove() ────────────────────────────────────────────────────────────────

describe('supplier.repository — remove()', () => {
  test('retourne true si supprimé', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 1 }]);
    expect(await repo.remove(1)).toBe(true);
  });

  test('retourne false si introuvable', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 0 }]);
    expect(await repo.remove(99)).toBe(false);
  });
});

// ── findByIdWithProducts() ────────────────────────────────────────────────────

describe('supplier.repository — findByIdWithProducts()', () => {
  test('retourne null si fournisseur inexistant', async () => {
    pool.execute.mockResolvedValue([[]]);
    expect(await repo.findByIdWithProducts(99)).toBeNull();
  });

  test('retourne le fournisseur avec ses produits et les KPIs calculés', async () => {
    pool.execute
      .mockResolvedValueOnce([[fakeSupplier]])
      .mockResolvedValueOnce([[
        { id: 1, name: 'Fil rouge', price_chf: '5.00', stock: 10, is_active: 1 },
        { id: 2, name: 'Fil bleu',  price_chf: '5.00', stock: 0,  is_active: 1 },
        { id: 3, name: 'Fil vert',  price_chf: '4.00', stock: 3,  is_active: 0 },
      ]]);

    const result = await repo.findByIdWithProducts(1);
    expect(result.products).toHaveLength(3);
    expect(result.kpis.totalProducts).toBe(3);
    expect(result.kpis.activeProducts).toBe(2);
    expect(result.kpis.outOfStock).toBe(1);
    expect(result.kpis.stockValue).toBeCloseTo(10 * 5 + 0 * 5 + 3 * 4, 1);
  });
});
