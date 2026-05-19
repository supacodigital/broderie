// Tests unitaires wishlist.repository — pool mocké

jest.mock('../../config/db', () => ({
  pool: { execute: jest.fn() },
}));

const { pool } = require('../../config/db');
const repo     = require('../../repositories/wishlist.repository');

beforeEach(() => jest.clearAllMocks());

// ── findByUser() ──────────────────────────────────────────────────────────────

describe('wishlist.repository — findByUser()', () => {
  test('retourne les produits de la wishlist avec infos produit', async () => {
    const fakeItems = [
      { id: 1, product_id: 5, product_name: 'Fil DMC', price_chf: '4.90' },
    ];
    pool.execute.mockResolvedValue([fakeItems]);

    const result = await repo.findByUser(1, 'fr');
    expect(result).toEqual(fakeItems);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('FROM wishlists w'), ['fr', 1]
    );
  });

  test('retourne tableau vide si wishlist vide', async () => {
    pool.execute.mockResolvedValue([[]]);
    const result = await repo.findByUser(99);
    expect(result).toEqual([]);
  });

  test('utilise la locale par défaut "fr" si non spécifiée', async () => {
    pool.execute.mockResolvedValue([[]]);
    await repo.findByUser(1);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.anything(), ['fr', 1]
    );
  });
});

// ── exists() ─────────────────────────────────────────────────────────────────

describe('wishlist.repository — exists()', () => {
  test('retourne true si produit dans la wishlist', async () => {
    pool.execute.mockResolvedValue([[{ id: 3 }]]);
    expect(await repo.exists(1, 5)).toBe(true);
  });

  test('retourne false si produit absent', async () => {
    pool.execute.mockResolvedValue([[]]);
    expect(await repo.exists(1, 99)).toBe(false);
  });
});

// ── add() ────────────────────────────────────────────────────────────────────

describe('wishlist.repository — add()', () => {
  test('ajoute le produit et retourne true', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 1 }]);
    expect(await repo.add(1, 5)).toBe(true);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT IGNORE INTO wishlists'), [1, 5]
    );
  });

  test('retourne false si déjà présent (INSERT IGNORE — affectedRows=0)', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 0 }]);
    expect(await repo.add(1, 5)).toBe(false);
  });
});

// ── remove() ─────────────────────────────────────────────────────────────────

describe('wishlist.repository — remove()', () => {
  test('supprime le produit de la wishlist et retourne true', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 1 }]);
    expect(await repo.remove(1, 5)).toBe(true);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM wishlists'), [1, 5]
    );
  });

  test('retourne false si produit non trouvé dans la wishlist', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 0 }]);
    expect(await repo.remove(1, 99)).toBe(false);
  });
});
