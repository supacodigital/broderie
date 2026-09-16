// Tests unitaires productCategory.repository — pool mocké (ADM-04)

jest.mock('../../config/db', () => ({
  pool: {
    execute: jest.fn(),
    query:   jest.fn(),
    getConnection: jest.fn(),
  },
}));

const { pool } = require('../../config/db');
const repo     = require('../../repositories/productCategory.repository');

beforeEach(() => jest.clearAllMocks());

// Connexion transactionnelle simulée
const fakeConnection = () => ({
  beginTransaction: jest.fn(),
  commit:           jest.fn(),
  rollback:         jest.fn(),
  release:          jest.fn(),
  execute:          jest.fn().mockResolvedValue([[]]),
  query:            jest.fn().mockResolvedValue([[]]),
});

// ── findByProductIds() ────────────────────────────────────────────────────────

describe('productCategory.repository — findByProductIds()', () => {
  test('retourne les rattachements de plusieurs produits en une seule requête', async () => {
    pool.execute.mockResolvedValue([[
      { product_id: 1, category_id: 101, is_primary: 1 },
      { product_id: 1, category_id: 115, is_primary: 0 },
      { product_id: 2, category_id: 105, is_primary: 1 },
    ]]);

    const rows = await repo.findByProductIds([1, 2], 'fr');

    expect(rows).toHaveLength(3);
    // Une seule requête quel que soit le nombre de produits — pas de N+1
    expect(pool.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toMatch(/IN \(\?,\?\)/);
    expect(params).toEqual(['fr', 1, 2]);
  });

  test('liste vide : aucune requête SQL', async () => {
    const rows = await repo.findByProductIds([], 'fr');
    expect(rows).toEqual([]);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  test('catégorie principale listée avant les rayons secondaires', async () => {
    pool.execute.mockResolvedValue([[]]);
    await repo.findByProductIds([1], 'fr');
    expect(pool.execute.mock.calls[0][0]).toMatch(/ORDER BY pc\.is_primary DESC/);
  });
});

// ── replaceForProduct() ───────────────────────────────────────────────────────

describe('productCategory.repository — replaceForProduct()', () => {
  test('remplace les rattachements : principale is_primary=1, secondaires ordonnés', async () => {
    const conn = fakeConnection();
    pool.getConnection.mockResolvedValue(conn);

    await repo.replaceForProduct(7, 101, [115, 116]);

    // Purge avant réécriture
    expect(conn.execute).toHaveBeenCalledWith(
      'DELETE FROM product_categories WHERE product_id = ?', [7]
    );
    // Insertion groupée — un seul aller-retour SQL
    expect(conn.query).toHaveBeenCalledTimes(1);
    const [sql, params] = conn.query.mock.calls[0];
    expect(sql).toMatch(/VALUES \(\?, \?, \?, \?\), \(\?, \?, \?, \?\), \(\?, \?, \?, \?\)/);
    expect(params).toEqual([
      7, 101, 1, 0, // principale
      7, 115, 0, 1, // secondaires, sort_order croissant
      7, 116, 0, 2,
    ]);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test('la catégorie principale rappelée dans les secondaires n’est pas dupliquée', async () => {
    const conn = fakeConnection();
    pool.getConnection.mockResolvedValue(conn);

    await repo.replaceForProduct(7, 101, [101, 115]);

    const params = conn.query.mock.calls[0][1];
    // 2 lignes seulement : 101 (principale) et 115
    expect(params).toEqual([7, 101, 1, 0, 7, 115, 0, 1]);
  });

  test('doublons dans les secondaires écartés', async () => {
    const conn = fakeConnection();
    pool.getConnection.mockResolvedValue(conn);

    await repo.replaceForProduct(7, 101, [115, 115, 116]);

    const params = conn.query.mock.calls[0][1];
    expect(params).toEqual([7, 101, 1, 0, 7, 115, 0, 1, 7, 116, 0, 2]);
  });

  test('sans catégorie ni rayon : purge seule, aucune insertion', async () => {
    const conn = fakeConnection();
    pool.getConnection.mockResolvedValue(conn);

    await repo.replaceForProduct(7, null, []);

    expect(conn.execute).toHaveBeenCalled();
    expect(conn.query).not.toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
  });

  test('erreur SQL : rollback et connexion relâchée', async () => {
    const conn = fakeConnection();
    conn.query.mockRejectedValue(new Error('SQL down'));
    pool.getConnection.mockResolvedValue(conn);

    await expect(repo.replaceForProduct(7, 101, [115])).rejects.toThrow('SQL down');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  test('connexion fournie : participe à la transaction de l’appelant sans la piloter', async () => {
    const conn = fakeConnection();

    await repo.replaceForProduct(7, 101, [115], conn);

    // La transaction appartient à l'appelant (mise à jour produit)
    expect(conn.beginTransaction).not.toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).not.toHaveBeenCalled();
    expect(pool.getConnection).not.toHaveBeenCalled();
  });
});
