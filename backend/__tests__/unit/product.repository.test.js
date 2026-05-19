// Tests unitaires product.repository — pool mocké

jest.mock('../../config/db', () => ({
  pool: {
    execute: jest.fn(),
    query:   jest.fn(),
  },
}));

const { pool } = require('../../config/db');
const repo     = require('../../repositories/product.repository');

beforeEach(() => jest.clearAllMocks());

const fakeProduct = {
  id: 1, slug: 'fil-dmc-rouge', name: 'Fil DMC Rouge',
  price_chf: '4.90', stock: 50, is_active: 1,
};
const fakeImages  = [{ id: 1, url: 'img.webp', is_primary: 1 }];
const fakeVariants = [{ id: 1, name: 'Couleur', value: 'Rouge', price_modifier: 0 }];

// ── findAll() ─────────────────────────────────────────────────────────────────

describe('product.repository — findAll()', () => {
  test('retourne liste paginée par défaut', async () => {
    pool.execute.mockResolvedValue([[{ total: 2 }]]);
    pool.query.mockResolvedValue([[{ id: 1 }, { id: 2 }]]);

    const result = await repo.findAll({ locale: 'fr' });
    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('is_active = 1'), expect.arrayContaining(['fr'])
    );
  });

  test('applique le filtre minPrice et maxPrice', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    await repo.findAll({ locale: 'fr', minPrice: 5, maxPrice: 20 });
    const countQuery = pool.execute.mock.calls[0][0];
    expect(countQuery).toContain('p.price_chf >=');
    expect(countQuery).toContain('p.price_chf <=');
  });

  test('applique le filtre inStock', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    await repo.findAll({ locale: 'fr', inStock: true });
    const countQuery = pool.execute.mock.calls[0][0];
    expect(countQuery).toContain('p.stock > 0');
  });

  test('applique le filtre featured', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    await repo.findAll({ locale: 'fr', featured: true });
    const countQuery = pool.execute.mock.calls[0][0];
    expect(countQuery).toContain('p.is_featured = 1');
  });

  test('applique le filtre categoryId', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    await repo.findAll({ locale: 'fr', categoryId: 3 });
    const countParams = pool.execute.mock.calls[0][1];
    expect(countParams).toContain(3);
  });

  test('applique le filtre categoryIds (plusieurs)', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    await repo.findAll({ locale: 'fr', categoryIds: [1, 2, 3] });
    const countParams = pool.execute.mock.calls[0][1];
    expect(countParams).toContain(1);
    expect(countParams).toContain(3);
  });

  test('applique le filtre badge (valide)', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    await repo.findAll({ locale: 'fr', badge: 'nouveaute' });
    const countParams = pool.execute.mock.calls[0][1];
    expect(countParams).toContain('nouveaute');
  });

  test('ignore un badge invalide', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    await repo.findAll({ locale: 'fr', badge: 'injection' });
    const countQuery = pool.execute.mock.calls[0][0];
    expect(countQuery).not.toContain('p.badge = ?');
  });

  test('applique le filtre minRating', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    await repo.findAll({ locale: 'fr', minRating: 4 });
    const countQuery = pool.execute.mock.calls[0][0];
    expect(countQuery).toContain('COALESCE');
  });

  test('applique le filtre q (recherche FULLTEXT)', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    await repo.findAll({ locale: 'fr', q: 'broderie' });
    const countQuery = pool.execute.mock.calls[0][0];
    expect(countQuery).toContain('MATCH');
  });
});

// ── findById() ────────────────────────────────────────────────────────────────

describe('product.repository — findById()', () => {
  test('retourne null si produit introuvable', async () => {
    pool.execute.mockResolvedValue([[]]);
    expect(await repo.findById(99)).toBeNull();
  });

  test('retourne le produit avec images et variantes', async () => {
    pool.execute
      .mockResolvedValueOnce([[fakeProduct]])
      .mockResolvedValueOnce([fakeImages])
      .mockResolvedValueOnce([fakeVariants]);

    const result = await repo.findById(1);
    expect(result.slug).toBe('fil-dmc-rouge');
    expect(result.images).toEqual(fakeImages);
    expect(result.variants).toEqual(fakeVariants);
  });
});

// ── findBySlug() ──────────────────────────────────────────────────────────────

describe('product.repository — findBySlug()', () => {
  test('retourne null si slug introuvable', async () => {
    pool.execute.mockResolvedValue([[]]);
    expect(await repo.findBySlug('inexistant')).toBeNull();
  });

  test('retourne le produit avec images et variantes', async () => {
    pool.execute
      .mockResolvedValueOnce([[fakeProduct]])
      .mockResolvedValueOnce([fakeImages])
      .mockResolvedValueOnce([fakeVariants]);

    const result = await repo.findBySlug('fil-dmc-rouge', 'fr');
    expect(result.id).toBe(1);
    expect(result.images).toHaveLength(1);
  });
});

// ── search() ──────────────────────────────────────────────────────────────────

describe('product.repository — search()', () => {
  test('retourne les résultats paginés avec score de pertinence', async () => {
    pool.execute.mockResolvedValue([[{ total: 1 }]]);
    pool.query.mockResolvedValue([[{ id: 1, relevance: 0.8 }]]);

    const result = await repo.search({ q: 'fil', locale: 'fr', page: 1, limit: 20 });
    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('MATCH(pt.name, pt.description)'),
      expect.arrayContaining(['fr', 'fil*'])
    );
  });

  test('retourne 0 résultats si aucune correspondance', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    const result = await repo.search({ q: 'xyzabc', locale: 'fr' });
    expect(result.total).toBe(0);
    expect(result.rows).toHaveLength(0);
  });
});

// ── findByCategoryId() ────────────────────────────────────────────────────────

describe('product.repository — findByCategoryId()', () => {
  test('retourne les produits paginés d\'une catégorie', async () => {
    pool.execute.mockResolvedValue([[{ total: 3 }]]);
    pool.query.mockResolvedValue([[{ id: 1 }, { id: 2 }, { id: 3 }]]);

    const result = await repo.findByCategoryId({ categoryId: 2, locale: 'fr' });
    expect(result.total).toBe(3);
    expect(result.rows).toHaveLength(3);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('p.category_id = ?'),
      expect.arrayContaining(['fr', 2])
    );
  });

  test('retourne 0 produits si catégorie vide', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    const result = await repo.findByCategoryId({ categoryId: 99 });
    expect(result.total).toBe(0);
  });
});
