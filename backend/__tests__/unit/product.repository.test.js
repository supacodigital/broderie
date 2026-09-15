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
    // COUNT simplifié (sans jointure traduction) quand il n'y a pas de recherche
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringMatching(/SELECT COUNT\(\*\)[\s\S]*is_active = 1/), []
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

  test('applique le filtre minRating sur la colonne dénormalisée', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    await repo.findAll({ locale: 'fr', minRating: 4 });
    const countQuery = pool.execute.mock.calls[0][0];
    expect(countQuery).toContain('p.rating_avg >= ?');
  });

  test('la liste ne joint plus reviews ni ne GROUP BY', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    await repo.findAll({ locale: 'fr' });
    const listQuery = pool.query.mock.calls[0][0];
    expect(listQuery).not.toMatch(/JOIN reviews/);
    expect(listQuery).not.toMatch(/GROUP BY/);
    expect(listQuery).toMatch(/p\.rating_avg AS avg_rating/);
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

  test('sélectionne url_medium et url_large pour le srcset de la galerie', async () => {
    pool.execute
      .mockResolvedValueOnce([[fakeProduct]])
      .mockResolvedValueOnce([fakeImages])
      .mockResolvedValueOnce([fakeVariants]);

    await repo.findBySlug('fil-dmc-rouge', 'fr');
    // 2e appel = requête images
    const imagesSql = pool.execute.mock.calls[1][0];
    expect(imagesSql).toMatch(/url_medium/);
    expect(imagesSql).toMatch(/url_large/);
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
      // « +fil* » : chaque mot est requis (+) et ouvert en préfixe (*) — voir toBooleanQuery
      expect.arrayContaining(['fr', '+fil*'])
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
    // COUNT simplifié : juste le category_id, sans jointure traduction
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringMatching(/SELECT COUNT\(\*\)[\s\S]*p\.category_id = \?/),
      [2]
    );
  });

  test('retourne 0 produits si catégorie vide', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    const result = await repo.findByCategoryId({ categoryId: 99 });
    expect(result.total).toBe(0);
  });
});

// ── Recherche FULLTEXT : construction de la requête booléenne ─────────────────
// Non-régression du signalement « on ne trouve pas les cotons moulinés » :
//  1. le joker n'était collé qu'à la fin de la phrase entière (« coton mouliné* »),
//     donc un seul mot était ouvert en préfixe et les termes restaient en OU ;
//  2. le pluriel saisi par le client ne retrouvait pas le singulier des fiches
//     (« cotons » vs « échevette de coton mouliné »).

describe('product.repository — requête booléenne FULLTEXT', () => {
  const booleanQueryOf = async (q) => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);
    await repo.findAll({ q, locale: 'fr', page: 1, limit: 20 });
    // Le paramètre de recherche est passé au COUNT juste après la locale
    const params = pool.execute.mock.calls[0][1];
    return params.find((v) => typeof v === 'string' && v.startsWith('+'));
  };

  test('chaque mot est requis et ouvert en préfixe', async () => {
    expect(await booleanQueryOf('coton mouliné')).toBe('+coton* +mouliné*');
  });

  test('le pluriel saisi retrouve le singulier des fiches produit', async () => {
    expect(await booleanQueryOf('cotons moulinés')).toBe('+coton* +mouliné*');
  });

  test('les mots courts ne sont pas amputés', async () => {
    expect(await booleanQueryOf('bas')).toBe('+bas*');
  });

  test('les caractères réservés du BOOLEAN MODE sont neutralisés', async () => {
    expect(await booleanQueryOf('+fil* -rouge')).toBe('+fil* +rouge*');
  });

  test('les espaces multiples ne produisent pas de terme vide', async () => {
    expect(await booleanQueryOf('  fil   rouge  ')).toBe('+fil* +rouge*');
  });
});
