// Tests unitaires category.admin.repository — pool mocké

jest.mock('../../config/db', () => ({
  pool: {
    execute:       jest.fn(),
    query:         jest.fn(),
    getConnection: jest.fn(),
  },
}));

const { pool }    = require('../../config/db');
const repo        = require('../../repositories/category.admin.repository');

beforeEach(() => jest.clearAllMocks());

function makeConn(responses = []) {
  let i = 0;
  return {
    beginTransaction: jest.fn().mockResolvedValue(),
    execute: jest.fn().mockImplementation(() => Promise.resolve(responses[i++] ?? [{ insertId: 1 }, []])),
    commit:  jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release: jest.fn(),
  };
}

// ── findAll() ─────────────────────────────────────────────────────────────────

describe('category.admin.repository — findAll()', () => {
  test('retourne tableau vide si aucune catégorie', async () => {
    pool.execute.mockResolvedValue([[]]);
    const result = await repo.findAll();
    expect(result).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('retourne catégories avec traductions regroupées', async () => {
    pool.execute.mockResolvedValue([[{ id: 1, slug: 'fils', sort_order: 0, product_count: 3 }]]);
    pool.query.mockResolvedValue([[
      { category_id: 1, locale: 'fr', name: 'Fils', description: null },
      { category_id: 1, locale: 'de', name: 'Fäden', description: null },
    ]]);

    const result = await repo.findAll();
    expect(result).toHaveLength(1);
    expect(result[0].translations.fr.name).toBe('Fils');
    expect(result[0].translations.de.name).toBe('Fäden');
  });
});

// ── findById() ────────────────────────────────────────────────────────────────

describe('category.admin.repository — findById()', () => {
  test('retourne null si catégorie inexistante', async () => {
    pool.execute.mockResolvedValue([[]]);
    expect(await repo.findById(99)).toBeNull();
  });

  test('retourne la catégorie avec ses traductions', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ id: 2, slug: 'aiguilles', parent_id: null }]])
      .mockResolvedValueOnce([[{ locale: 'fr', name: 'Aiguilles', description: null }]]);

    const result = await repo.findById(2);
    expect(result.slug).toBe('aiguilles');
    expect(result.translations.fr.name).toBe('Aiguilles');
  });
});

// ── create() ─────────────────────────────────────────────────────────────────

describe('category.admin.repository — create()', () => {
  test('insère la catégorie et ses traductions, retourne l\'id', async () => {
    const conn = makeConn([
      [{ insertId: 5 }, []],  // INSERT categories
      [[], []],               // INSERT translation fr
      [[], []],               // INSERT translation de
    ]);
    pool.getConnection.mockResolvedValue(conn);

    const id = await repo.create({
      parentId: null, slug: 'caneva', imageUrl: null, sortOrder: 1,
      translations: {
        fr: { name: 'Canevas', description: null },
        de: { name: 'Kanvas',  description: null },
      },
    });

    expect(id).toBe(5);
    expect(conn.execute).toHaveBeenCalledTimes(3);
    expect(conn.commit).toHaveBeenCalled();
  });

  test('rollback si erreur SQL', async () => {
    const conn = makeConn();
    conn.execute = jest.fn().mockRejectedValue(new Error('duplicate slug'));
    pool.getConnection.mockResolvedValue(conn);

    await expect(repo.create({ slug: 'x', translations: { fr: { name: 'X' } } }))
      .rejects.toThrow('duplicate slug');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});

// ── update() ─────────────────────────────────────────────────────────────────

describe('category.admin.repository — update()', () => {
  test('met à jour la catégorie et ses traductions', async () => {
    const conn = makeConn([[[], []], [[], []]]);
    pool.getConnection.mockResolvedValue(conn);

    await repo.update(1, {
      parentId: null, slug: 'fils', imageUrl: null, sortOrder: 0,
      translations: { fr: { name: 'Fils mis à jour', description: null } },
    });

    expect(conn.execute).toHaveBeenCalledTimes(2);
    expect(conn.commit).toHaveBeenCalled();
  });

  test('ne modifie pas les traductions si non fournies', async () => {
    const conn = makeConn([[[], []]]);
    pool.getConnection.mockResolvedValue(conn);

    await repo.update(1, { parentId: null, slug: 'fils', imageUrl: null, sortOrder: 0 });

    expect(conn.execute).toHaveBeenCalledTimes(1);
  });

  test('rollback si erreur', async () => {
    const conn = makeConn();
    conn.execute = jest.fn().mockRejectedValue(new Error('SQL'));
    pool.getConnection.mockResolvedValue(conn);

    await expect(repo.update(1, { slug: 'x' })).rejects.toThrow('SQL');
    expect(conn.rollback).toHaveBeenCalled();
  });
});

// ── remove() ─────────────────────────────────────────────────────────────────

describe('category.admin.repository — remove()', () => {
  test('lève une erreur si des produits sont liés', async () => {
    pool.execute.mockResolvedValue([[{ total: 3 }]]);

    await expect(repo.remove(1))
      .rejects.toThrow(/3 produit/);
  });

  test('supprime la catégorie et ses traductions si aucun produit lié', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    const conn = makeConn([[[], []], [[], []]]);
    pool.getConnection.mockResolvedValue(conn);

    await repo.remove(1);

    expect(conn.execute).toHaveBeenCalledTimes(2);
    expect(conn.execute).toHaveBeenNthCalledWith(1,
      expect.stringContaining('DELETE FROM category_translations'), [1]
    );
    expect(conn.commit).toHaveBeenCalled();
  });
});

// ── slugExists() ──────────────────────────────────────────────────────────────

describe('category.admin.repository — slugExists()', () => {
  test('retourne true si slug déjà pris', async () => {
    pool.execute.mockResolvedValue([[{ id: 2 }]]);
    expect(await repo.slugExists('fils')).toBe(true);
  });

  test('retourne false si slug disponible', async () => {
    pool.execute.mockResolvedValue([[]]);
    expect(await repo.slugExists('nouveau-slug')).toBe(false);
  });

  test('exclut l\'id courant lors de l\'édition', async () => {
    pool.execute.mockResolvedValue([[]]);
    await repo.slugExists('fils', 3);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('id != ?'), ['fils', 3]
    );
  });
});
