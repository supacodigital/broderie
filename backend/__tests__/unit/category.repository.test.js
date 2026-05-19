// Tests unitaires category.repository (public) — pool mocké

jest.mock('../../config/db', () => ({
  pool: { execute: jest.fn() },
}));

const { pool } = require('../../config/db');
const repo     = require('../../repositories/category.repository');

beforeEach(() => jest.clearAllMocks());

const fakeCategories = [
  { id: 1, parent_id: null, slug: 'fils', sort_order: 0, name: 'Fils', description: null, product_count: 12 },
  { id: 2, parent_id: 1,    slug: 'fils-dmc', sort_order: 1, name: 'Fils DMC', description: null, product_count: 5 },
];

// ── findAll() ────────────────────────────────────────────────────────────────

describe('category.repository — findAll()', () => {
  test('retourne toutes les catégories avec traductions FR par défaut', async () => {
    pool.execute.mockResolvedValue([fakeCategories]);

    const result = await repo.findAll();
    expect(result).toEqual(fakeCategories);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('ct.locale = ?'), ['fr']
    );
  });

  test('accepte une locale différente (de)', async () => {
    pool.execute.mockResolvedValue([[{ id: 1, name: 'Fäden', product_count: 12 }]]);

    const result = await repo.findAll('de');
    expect(result[0].name).toBe('Fäden');
    expect(pool.execute).toHaveBeenCalledWith(
      expect.anything(), ['de']
    );
  });

  test('retourne tableau vide si aucune catégorie', async () => {
    pool.execute.mockResolvedValue([[]]);
    const result = await repo.findAll('fr');
    expect(result).toEqual([]);
  });

  test('filtre par locale dans la jointure product_count', async () => {
    pool.execute.mockResolvedValue([fakeCategories]);
    await repo.findAll('en');
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('is_active = 1'), ['en']
    );
  });
});

// ── findBySlug() ─────────────────────────────────────────────────────────────

describe('category.repository — findBySlug()', () => {
  test('retourne la catégorie par slug', async () => {
    pool.execute.mockResolvedValue([[fakeCategories[0]]]);

    const result = await repo.findBySlug('fils', 'fr');
    expect(result).toEqual(fakeCategories[0]);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('WHERE c.slug = ?'), ['fr', 'fils']
    );
  });

  test('retourne null si slug introuvable', async () => {
    pool.execute.mockResolvedValue([[]]);
    const result = await repo.findBySlug('inexistant');
    expect(result).toBeNull();
  });

  test('utilise "fr" comme locale par défaut', async () => {
    pool.execute.mockResolvedValue([[]]);
    await repo.findBySlug('fils');
    expect(pool.execute).toHaveBeenCalledWith(
      expect.anything(), ['fr', 'fils']
    );
  });
});
