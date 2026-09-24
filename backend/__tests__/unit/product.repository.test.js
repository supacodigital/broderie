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
    /* Le filtre porte sur le prix RÉELLEMENT payé (expression CASE de
       promo.utils), pas sur p.price_chf brut : hors fenêtre de promotion,
       c'est le prix normal (compare_price_chf) qui doit être filtré. */
    expect(countQuery).toMatch(/CASE WHEN[\s\S]*compare_price_chf[\s\S]*>=\s*\?/);
    expect(countQuery).toMatch(/CASE WHEN[\s\S]*compare_price_chf[\s\S]*<=\s*\?/);
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

/* Repli anti-faute de frappe — régression.
   « mouliner » / « moulne » ne remontaient rien alors que le catalogue est plein
   de « mouliné » : le joker FULLTEXT ne corrige pas une lettre erronée. */
describe('product.repository — findAll() repli anti-faute', () => {
  test('une recherche qui aboutit n\'est jamais élargie (une seule passe)', async () => {
    pool.execute.mockResolvedValue([[{ total: 5 }]]);
    pool.query.mockResolvedValue([[{ id: 1 }]]);

    const res = await repo.findAll({ locale: 'fr', q: 'mouliné' });

    expect(res.total).toBe(5);
    expect(res.isFuzzy).toBeUndefined();
    // Une seule requête de comptage : pas de seconde passe
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });

  test('zéro résultat déclenche une seconde passe avec des préfixes élargis', async () => {
    // 1re passe : aucun résultat — 2e passe : le repli en trouve
    pool.execute
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[{ total: 12 }]]);
    pool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 1 }]]);

    const res = await repo.findAll({ locale: 'fr', q: 'mouliner' });

    expect(res.total).toBe(12);
    expect(res.isFuzzy).toBe(true);
    expect(pool.execute).toHaveBeenCalledTimes(2);
    // « mouliner » (8 lettres) est tronqué à « moulin » puis élargi
    expect(pool.execute.mock.calls[1][1]).toContain('+moulin*');
  });

  test('les mots courts ne sont pas tronqués — pas de seconde passe inutile', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    const res = await repo.findAll({ locale: 'fr', q: 'chat' });

    // « chat » fait moins de 6 lettres : le repli serait identique à la requête initiale
    expect(res.total).toBe(0);
    expect(res.isFuzzy).toBeUndefined();
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });

  test('si le repli ne donne rien non plus, le résultat vide est conservé', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    const res = await repo.findAll({ locale: 'fr', q: 'tronconneuse' });

    expect(res.total).toBe(0);
    expect(res.isFuzzy).toBeUndefined();
  });

  test('sans recherche texte, aucun repli — un filtre vide reste vide', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    await repo.findAll({ locale: 'fr', categoryId: 42 });

    expect(pool.execute).toHaveBeenCalledTimes(1);
  });
});

/* Recherche par référence produit (SKU / EAN) — régression.
   Les références imprimées dans les catalogues des éditeurs ne remontaient
   aucun résultat : ni sku ni ean ne figurent dans l'index FULLTEXT. */
describe('product.repository — findAll() recherche par référence', () => {
  test('une saisie ressemblant à une référence compare le SKU et l\'EAN', async () => {
    pool.execute.mockResolvedValue([[{ total: 1 }]]);
    pool.query.mockResolvedValue([[{ id: 1 }]]);

    await repo.findAll({ locale: 'fr', q: 'PE5860' });

    const countQuery  = pool.execute.mock.calls[0][0];
    const countParams = pool.execute.mock.calls[0][1];
    expect(countQuery).toMatch(/p\.sku/);
    expect(countQuery).toMatch(/p\.ean = \?/);
    // La référence est passée nettoyée, en plus des paramètres FULLTEXT et marque
    expect(countParams).toContain('PE5860');
  });

  test('les séparateurs sont ignorés : « 1006-5860 » et « 1006 5860 » donnent la même référence', async () => {
    pool.execute.mockResolvedValue([[{ total: 1 }]]);
    pool.query.mockResolvedValue([[{ id: 1 }]]);

    await repo.findAll({ locale: 'fr', q: '1006-5860' });
    expect(pool.execute.mock.calls[0][1]).toContain('10065860');

    jest.clearAllMocks();
    pool.execute.mockResolvedValue([[{ total: 1 }]]);
    pool.query.mockResolvedValue([[{ id: 1 }]]);

    await repo.findAll({ locale: 'fr', q: '1006 5860' });
    expect(pool.execute.mock.calls[0][1]).toContain('10065860');
  });

  test('une correspondance de référence est classée avant les correspondances de nom', async () => {
    pool.execute.mockResolvedValue([[{ total: 1 }]]);
    pool.query.mockResolvedValue([[{ id: 1 }]]);

    await repo.findAll({ locale: 'fr', q: 'PE5860' });

    // La recherche des rayons correspondants passe aussi par pool.query : on vise la requête produits
    const selectQuery = pool.query.mock.calls.map((c) => c[0]).find((sql) => sql.includes('FROM products p'));
    // Le score de référence (1000) domine le score FULLTEXT
    expect(selectQuery).toMatch(/1000 \*/);
    expect(selectQuery).toMatch(/ORDER BY relevance DESC/);
  });

  /* Audit complet du 24/09 — sans séparateurs, « WDKF022-7-5 » et « WDKF022-75 »
     se confondent : la référence saisie à l'identique doit passer devant. */
  test('la référence saisie à l\'identique passe devant la référence sans séparateurs', async () => {
    pool.execute.mockResolvedValue([[{ total: 2 }]]);
    pool.query.mockResolvedValue([[{ id: 1 }]]);

    await repo.findAll({ locale: 'fr', q: ' WDKF022-7-5 ' });

    const call = pool.query.mock.calls.find((c) => c[0].includes('FROM products p'));
    expect(call[0]).toMatch(/1000 \* COALESCE\(p\.sku = \?, 0\) \+ 1000 \* COALESCE\(REPLACE/);
    // Référence exacte (espaces retirés), puis référence sans séparateurs, puis EAN
    const at = call[1].indexOf('WDKF022-7-5');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(call[1].slice(at, at + 3)).toEqual(['WDKF022-7-5', 'WDKF02275', 'WDKF02275']);
  });

  test('une saisie purement textuelle ne déclenche aucune comparaison de référence', async () => {
    pool.execute.mockResolvedValue([[{ total: 0 }]]);
    pool.query.mockResolvedValue([[]]);

    await repo.findAll({ locale: 'fr', q: 'coton mouliné' });

    const countQuery = pool.execute.mock.calls[0][0];
    // Pas de chiffre dans la saisie → pas de test sur sku/ean, la requête reste légère
    expect(countQuery).not.toMatch(/p\.ean = \?/);
  });
});

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

// ── findByCategoryIds() ───────────────────────────────────────────────────────

describe('product.repository — findByCategoryIds()', () => {
  test('retourne les produits paginés d\'une catégorie', async () => {
    pool.execute.mockResolvedValue([[{ total: 3 }]]);
    pool.query.mockResolvedValue([[{ id: 1 }, { id: 2 }, { id: 3 }]]);

    const result = await repo.findByCategoryIds({ categoryId: 2, locale: 'fr' });
    expect(result.total).toBe(3);
    expect(result.rows).toHaveLength(3);
    // COUNT simplifié : rattachement lu sur product_categories (ADM-04 — les
    // rayons secondaires comptent), sans jointure traduction
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringMatching(/SELECT COUNT\(\*\)[\s\S]*product_categories pc[\s\S]*pc\.category_id IN \(\?\)/),
      [2]
    );
  });

  /* Un rayon interroge sa descendance complète : la liste d'ids doit se
     retrouver telle quelle dans le IN, sans quoi les sous-catégories seraient
     ignorées. */
  test('interroge toute la descendance quand plusieurs ids sont fournis', async () => {
    pool.execute.mockResolvedValue([[{ total: 5 }]]);
    pool.query.mockResolvedValue([[]]);

    await repo.findByCategoryIds({ categoryIds: [2, 20, 200], locale: 'fr' });

    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringMatching(/pc\.category_id IN \(\?,\?,\?\)/),
      [2, 20, 200]
    );
  });

  test('liste vide : aucune requête, résultat vide', async () => {
    const result = await repo.findByCategoryIds({ categoryIds: [], locale: 'fr' });
    expect(result).toEqual({ rows: [], total: 0 });
    expect(pool.execute).not.toHaveBeenCalled();
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

  /* Audit complet du 24/09 — « this » passé au singulier devenait « thi », plus
     reconnu comme mot vide : « RTO, kit this is for you » ne renvoyait RIEN. */
  test('un mot vide terminé par « s » n\'est pas mis au singulier puis exigé', async () => {
    expect(await booleanQueryOf('RTO, kit this is for you')).toBe('+RTO* +kit* +you*');
  });

  // Les mots vides ne prennent plus de place dans la limite de 8 mots
  test('les mots vides ne comptent pas dans la limite de mots', async () => {
    expect(await booleanQueryOf('RTO, kit this is the story of Little Red Riding Hood'))
      .toBe('+RTO* +kit* +story* +Little* +Red* +Riding* +Hood*');
  });

  // Rien d'autre à chercher : les mots vides sont gardés (« is », trop court, part ensuite)
  test('une saisie faite uniquement de mots vides est gardée', async () => {
    expect(await booleanQueryOf('this is')).toBe('+thi*');
  });
});
