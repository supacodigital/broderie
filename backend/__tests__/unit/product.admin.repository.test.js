// Tests unitaires product.admin.repository — pool mocké

jest.mock('../../config/db', () => ({
  pool: {
    execute:       jest.fn(),
    query:         jest.fn(),
    getConnection: jest.fn(),
  },
}));

const { pool } = require('../../config/db');
const repo     = require('../../repositories/product.admin.repository');

beforeEach(() => jest.clearAllMocks());

function makeConn(responses = []) {
  let i = 0;
  return {
    beginTransaction: jest.fn().mockResolvedValue(),
    execute: jest.fn().mockImplementation(() =>
      Promise.resolve(responses[i++] ?? [{ insertId: 1, affectedRows: 1 }, []])
    ),
    commit:   jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release:  jest.fn(),
  };
}

// ── create() ─────────────────────────────────────────────────────────────────

describe('product.admin.repository — create()', () => {
  test('insère le produit et ses traductions, retourne l\'id', async () => {
    const conn = makeConn([
      [{ insertId: 10 }, []],  // INSERT products
      [[], []],                // INSERT translation fr
      [[], []],                // INSERT translation de
    ]);
    pool.getConnection.mockResolvedValue(conn);

    const id = await repo.create({
      categoryId: 1, supplierId: 2, slug: 'fil-dmc-rouge',
      priceChf: 4.90, taxRateId: 1, stock: 50, weightKg: 0.1,
      isFeatured: false, badge: null,
      translations: {
        fr: { name: 'Fil DMC Rouge', description: 'Fil rouge', slug: 'fil-dmc-rouge' },
        de: { name: 'DMC Faden Rot',  description: null,        slug: 'dmc-faden-rot' },
      },
    });

    expect(id).toBe(10);
    expect(conn.execute).toHaveBeenCalledTimes(3);
    expect(conn.commit).toHaveBeenCalled();
  });

  test('rollback si erreur lors de l\'insertion', async () => {
    const conn = makeConn();
    conn.execute = jest.fn().mockRejectedValue(new Error('duplicate sku'));
    pool.getConnection.mockResolvedValue(conn);

    await expect(repo.create({ slug: 'x', priceChf: 5, taxRateId: 1, translations: { fr: { name: 'X' } } }))
      .rejects.toThrow('duplicate sku');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});

// ── update() ─────────────────────────────────────────────────────────────────

describe('product.admin.repository — update()', () => {
  test('met à jour le produit sans slug', async () => {
    const conn = makeConn([[[], []], [[], []]]);
    pool.getConnection.mockResolvedValue(conn);

    await repo.update(1, {
      categoryId: 1, supplierId: 2,
      priceChf: 5.90, taxRateId: 1, stock: 40, weightKg: 0.1,
      isFeatured: false, isActive: true, badge: null,
      translations: { fr: { name: 'Fil mis à jour', description: null } },
    });

    expect(conn.execute).toHaveBeenCalledTimes(2);
    expect(conn.commit).toHaveBeenCalled();
  });

  test('inclut la mise à jour du slug si fourni', async () => {
    const conn = makeConn([[[], []]]);
    pool.getConnection.mockResolvedValue(conn);

    await repo.update(1, {
      categoryId: 1, supplierId: null, slug: 'nouveau-slug',
      priceChf: 5.00, taxRateId: 1, stock: 10, weightKg: null,
      isFeatured: false, isActive: true, badge: null,
    });

    const updateCall = conn.execute.mock.calls[0][0];
    expect(updateCall).toContain('slug = ?');
  });

  test('rollback si erreur', async () => {
    const conn = makeConn();
    conn.execute = jest.fn().mockRejectedValue(new Error('FK error'));
    pool.getConnection.mockResolvedValue(conn);

    await expect(repo.update(1, { categoryId: 99, priceChf: 5, taxRateId: 1, stock: 0 }))
      .rejects.toThrow('FK error');
    expect(conn.rollback).toHaveBeenCalled();
  });
});

// ── softDelete() ─────────────────────────────────────────────────────────────

describe('product.admin.repository — softDelete()', () => {
  test('met deleted_at et is_active=0', async () => {
    pool.execute.mockResolvedValue([{}]);
    await repo.softDelete(5);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('SET deleted_at = NOW(), is_active = 0'), [5]
    );
  });
});

// ── addImage() ────────────────────────────────────────────────────────────────

describe('product.admin.repository — addImage()', () => {
  test('insère l\'image et retourne l\'insertId', async () => {
    pool.execute.mockResolvedValue([{ insertId: 7 }]);
    const id = await repo.addImage({
      productId: 1, url: 'http://img.test/large.webp',
      urlThumbnail: 'http://img.test/thumb.webp',
      urlMedium: 'http://img.test/medium.webp',
      urlLarge: 'http://img.test/large.webp',
      alt: 'Fil rouge', sortOrder: 0, isPrimary: false,
    });
    expect(id).toBe(7);
  });

  test('reset les images primaires avant d\'insérer si isPrimary=true', async () => {
    pool.execute
      .mockResolvedValueOnce([{}])               // UPDATE is_primary = 0
      .mockResolvedValueOnce([{ insertId: 8 }]); // INSERT

    await repo.addImage({
      productId: 1, url: 'http://img.test/new.webp',
      isPrimary: true, sortOrder: 0,
    });

    expect(pool.execute).toHaveBeenCalledTimes(2);
    expect(pool.execute).toHaveBeenNthCalledWith(1,
      expect.stringContaining('SET is_primary = 0'), [1]
    );
  });
});

// ── removeImage() ─────────────────────────────────────────────────────────────

describe('product.admin.repository — removeImage()', () => {
  test('retourne true si image supprimée', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 1 }]);
    expect(await repo.removeImage(3, 1)).toBe(true);
  });

  test('retourne false si image inexistante ou mauvais productId', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 0 }]);
    expect(await repo.removeImage(99, 1)).toBe(false);
  });
});

// ── setPrimaryImage() ─────────────────────────────────────────────────────────

describe('product.admin.repository — setPrimaryImage()', () => {
  test('retourne false si image n\'appartient pas au produit', async () => {
    const conn = makeConn([[[]]]); // SELECT retourne vide
    pool.getConnection.mockResolvedValue(conn);

    const result = await repo.setPrimaryImage(99, 1);
    expect(result).toBe(false);
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('définit l\'image comme primaire et retourne true', async () => {
    const conn = makeConn([
      [[{ id: 5 }], []],  // SELECT — image trouvée
      [[], []],           // UPDATE is_primary = 0
      [[], []],           // UPDATE is_primary = 1
    ]);
    pool.getConnection.mockResolvedValue(conn);

    const result = await repo.setPrimaryImage(5, 1);
    expect(result).toBe(true);
    expect(conn.commit).toHaveBeenCalled();
  });

  test('rollback si erreur SQL', async () => {
    const conn = makeConn();
    conn.execute = jest.fn().mockRejectedValue(new Error('SQL'));
    pool.getConnection.mockResolvedValue(conn);

    await expect(repo.setPrimaryImage(5, 1)).rejects.toThrow('SQL');
    expect(conn.rollback).toHaveBeenCalled();
  });
});

// ── findByIdAdmin() ───────────────────────────────────────────────────────────

describe('product.admin.repository — findByIdAdmin()', () => {
  test('retourne null si produit introuvable', async () => {
    pool.execute.mockResolvedValue([[]]);
    expect(await repo.findByIdAdmin(99)).toBeNull();
  });

  test('retourne le produit avec ses images', async () => {
    const fakeProduct = { id: 1, slug: 'fil-rouge', name: 'Fil Rouge', stock: 10 };
    const fakeImages  = [{ id: 1, url: 'img.webp', is_primary: 1 }];
    pool.execute
      .mockResolvedValueOnce([[fakeProduct]])
      .mockResolvedValueOnce([fakeImages]);

    const result = await repo.findByIdAdmin(1);
    expect(result.slug).toBe('fil-rouge');
    expect(result.images).toEqual(fakeImages);
  });
});

// ── findAllAdmin() ────────────────────────────────────────────────────────────

describe('product.admin.repository — findAllAdmin()', () => {
  test('retourne liste paginée sans filtre', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 3 }]])
      .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }, { id: 3 }]]);

    const result = await repo.findAllAdmin();
    expect(result.total).toBe(3);
    expect(result.rows).toHaveLength(3);
  });

  test('applique le filtre search', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ id: 1 }]]);

    await repo.findAllAdmin({ search: 'fil' });
    const countParams = pool.query.mock.calls[0][1];
    expect(countParams).toContain('%fil%');
  });

  test('applique le filtre inStock', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    await repo.findAllAdmin({ inStock: true });
    const countQuery = pool.query.mock.calls[0][0];
    expect(countQuery).toContain('p.stock > 0');
  });

  test('applique le filtre lowStock', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 2 }]])
      .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]);

    await repo.findAllAdmin({ lowStock: true });
    const countQuery = pool.query.mock.calls[0][0];
    expect(countQuery).toContain('p.stock <= 5');
  });

  test('applique tous les filtres combinés', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ id: 5 }]]);

    await repo.findAllAdmin({
      categoryId: 2, supplierId: 3,
      minPrice: 5, maxPrice: 50,
      isActive: true, isFeatured: false,
    });

    const countQuery = pool.query.mock.calls[0][0];
    expect(countQuery).toContain('p.category_id IN');
    expect(countQuery).toContain('p.supplier_id = ?');
    expect(countQuery).toContain('p.price_chf >=');
    expect(countQuery).toContain('p.price_chf <=');
  });
});
