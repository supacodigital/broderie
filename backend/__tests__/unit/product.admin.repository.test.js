// Tests unitaires product.admin.repository — pool mocké

jest.mock('../../config/db', () => ({
  pool: {
    execute:       jest.fn(),
    query:         jest.fn(),
    getConnection: jest.fn(),
  },
}));
jest.mock('../../config/storage', () => ({
  saveBuffer:  jest.fn(),
  deleteLocal: jest.fn(),
}));

const { pool }  = require('../../config/db');
const storage   = require('../../config/storage');
const repo      = require('../../repositories/product.admin.repository');

beforeEach(() => jest.clearAllMocks());

function makeConn(responses = []) {
  let i = 0;
  return {
    beginTransaction: jest.fn().mockResolvedValue(),
    execute: jest.fn().mockImplementation(() =>
      Promise.resolve(responses[i++] ?? [{ insertId: 1, affectedRows: 1 }, []])
    ),
    // Insertion groupée des rayons du produit (ADM-04) — passe par query()
    query:    jest.fn().mockResolvedValue([{ affectedRows: 1 }, []]),
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
      [[], []],                // INSERT historique des prix (prix de départ, ADM-21)
      [[], []],                // INSERT translation fr
      [[], []],                // INSERT translation de
    ]);
    pool.getConnection.mockResolvedValue(conn);

    const id = await repo.create({
      categoryId: 1, supplierId: 2, slug: 'fil-dmc-rouge',
      priceChf: 4.90, taxRateId: 1, stock: 50, weightKg: 0.1,
      isFeatured: false, badge: null, brand: 'DMC',
      translations: {
        fr: { name: 'Fil DMC Rouge', description: 'Fil rouge', slug: 'fil-dmc-rouge' },
        de: { name: 'DMC Faden Rot',  description: null,        slug: 'dmc-faden-rot' },
      },
    });

    expect(id).toBe(10);
    // 1 INSERT products + 1 prix de départ (ADM-21) + 2 INSERT translations + 1 DELETE des rayons (ADM-04)
    expect(conn.execute).toHaveBeenCalledTimes(5);
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
    // Relecture des rayons existants : secondaryCategoryIds non fourni (ADM-04)
    pool.execute.mockResolvedValue([[]]);

    await repo.update(1, {
      categoryId: 1, supplierId: 2,
      priceChf: 5.90, taxRateId: 1, stock: 40, weightKg: 0.1,
      isFeatured: false, isActive: true, badge: null,
      translations: { fr: { name: 'Fil mis à jour', description: null } },
    });

    /* 1 SELECT de l'ancien prix (ADM-21) + 1 UPDATE products + 1 INSERT dans
       l'historique des prix + 1 INSERT traduction + 1 DELETE des rayons (ADM-04).
       Le SELECT précède l'UPDATE : sans lui, l'ancien prix serait déjà perdu. */
    expect(conn.execute).toHaveBeenCalledTimes(5);
    expect(conn.commit).toHaveBeenCalled();
  });

  test('conserve les rayons existants quand secondaryCategoryIds n’est pas fourni', async () => {
    const conn = makeConn([[[], []]]);
    pool.getConnection.mockResolvedValue(conn);
    // Le produit était rangé dans un rayon secondaire (115) en plus de sa principale
    pool.execute.mockResolvedValue([[
      { product_id: 1, category_id: 1,   is_primary: 1 },
      { product_id: 1, category_id: 115, is_primary: 0 },
    ]]);

    await repo.update(1, {
      categoryId: 1, supplierId: null,
      priceChf: 5.00, taxRateId: 1, stock: 10, weightKg: null,
      isFeatured: false, isActive: true, badge: null,
    });

    // Le rayon secondaire 115 est réinséré, pas perdu par la mise à jour partielle
    const params = conn.query.mock.calls[0][1];
    expect(params).toEqual([1, 1, 1, 0, 1, 115, 0, 1]);
  });

  test('inclut la mise à jour du slug si fourni', async () => {
    const conn = makeConn([[[], []]]);
    pool.getConnection.mockResolvedValue(conn);
    pool.execute.mockResolvedValue([[]]);

    await repo.update(1, {
      categoryId: 1, supplierId: null, slug: 'nouveau-slug',
      priceChf: 5.00, taxRateId: 1, stock: 10, weightKg: null,
      isFeatured: false, isActive: true, badge: null,
    });

    /* On cible l'UPDATE par son contenu et non par sa position : le premier
       appel est désormais la lecture de l'ancien prix (ADM-21). */
    const updateCall = conn.execute.mock.calls
      .map(([sql]) => sql)
      .find((sql) => sql.includes('UPDATE products SET'));
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
  test('retourne true et supprime les fichiers disque des 3 variantes', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ url: '/uploads/products/u-large.webp', url_thumbnail: '/uploads/products/u-thumbnail.webp', url_medium: '/uploads/products/u-medium.webp', url_large: '/uploads/products/u-large.webp' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    expect(await repo.removeImage(3, 1)).toBe(true);
    expect(storage.deleteLocal).toHaveBeenCalledWith('/uploads/products/u-thumbnail.webp');
    expect(storage.deleteLocal).toHaveBeenCalledWith('/uploads/products/u-medium.webp');
    expect(storage.deleteLocal).toHaveBeenCalledWith('/uploads/products/u-large.webp');
  });

  test('retourne false si image inexistante ou mauvais productId — aucun fichier touché', async () => {
    pool.execute.mockResolvedValueOnce([[]]);
    expect(await repo.removeImage(99, 1)).toBe(false);
    expect(storage.deleteLocal).not.toHaveBeenCalled();
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

/* Repli anti-faute côté administration — régression.
   La boutique rattrapait « mouliner » depuis le 2026-09-16, pas l'admin :
   la cliente trouvait un article en vitrine mais pas dans son back-office. */
describe('product.admin.repository — findAllAdmin() repli anti-faute', () => {
  test('une recherche qui aboutit n\'est pas élargie (une seule passe)', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 4 }]])
      .mockResolvedValueOnce([[{ id: 1 }]]);

    const res = await repo.findAllAdmin({ search: 'mouline' });

    expect(res.total).toBe(4);
    expect(res.isFuzzy).toBeUndefined();
    expect(pool.query).toHaveBeenCalledTimes(2); // 1 count + 1 select
  });

  test('zéro résultat relance la recherche avec des termes raccourcis', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 0 }]])   // count 1re passe
      .mockResolvedValueOnce([[]])               // select 1re passe
      .mockResolvedValueOnce([[{ total: 7 }]])   // count repli
      .mockResolvedValueOnce([[{ id: 1 }]]);     // select repli

    const res = await repo.findAllAdmin({ search: 'mouliner' });

    expect(res.total).toBe(7);
    expect(res.isFuzzy).toBe(true);
    // « mouliner » (8 lettres) est tronqué à « moulin »
    expect(pool.query.mock.calls[2][1]).toContain('%moulin%');
  });

  test('les mots courts ne sont pas tronqués — pas de seconde passe', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    const res = await repo.findAllAdmin({ search: 'chat' });

    expect(res.total).toBe(0);
    expect(res.isFuzzy).toBeUndefined();
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  test('sans recherche, aucun repli', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    await repo.findAllAdmin({ categoryId: 42 });
    expect(pool.query).toHaveBeenCalledTimes(2);
  });
});

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

  /* Non-régression « moteur de recherche pas assez précis » : la saisie entière
     servait de motif unique, donc « DMC 745 » ne trouvait pas « DMC mouliné N° 745 ». */
  test('exige chaque mot séparément, quel que soit leur ordre', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ id: 1 }]]);

    await repo.findAllAdmin({ search: 'DMC 745' });
    const [sql, params] = pool.query.mock.calls[0];
    // Un bloc de conditions par mot, et non un seul motif « %DMC 745% »
    expect(params).toContain('%DMC%');
    expect(params).toContain('%745%');
    expect(params).not.toContain('%DMC 745%');
    expect(sql.match(/pt\.name LIKE \?/g)).toHaveLength(2);
  });

  test('le pluriel saisi retrouve le singulier des fiches', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ id: 1 }]]);

    await repo.findAllAdmin({ search: 'cotons moulinés' });
    const params = pool.query.mock.calls[0][1];
    expect(params).toContain('%coton%');
    expect(params).toContain('%mouliné%');
  });

  test('une recherche vide ne filtre rien', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 5 }]])
      .mockResolvedValueOnce([[]]);

    await repo.findAllAdmin({ search: '   ' });
    const sql = pool.query.mock.calls[0][0];
    expect(sql).not.toContain('LIKE ?');
  });

  test('applique le filtre inStock', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    await repo.findAllAdmin({ inStock: true });
    const countQuery = pool.query.mock.calls[0][0];
    expect(countQuery).toContain('p.stock > 0');
  });

  /* Le filtre « stock bas » sert au réassort : les articles « sur commande »,
     à 0 par nature, noyaient les ~1 750 vrais réassorts sous ~12 900 lignes. */
  test('le filtre lowStock exclut les articles sur commande', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    await repo.findAllAdmin({ lowStock: true });
    const countQuery = pool.query.mock.calls[0][0];
    expect(countQuery).toContain('p.stock <= 5');
    expect(countQuery).toContain('p.is_made_to_order = 0');
  });

  test('applique le filtre lowStock', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 2 }]])
      .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]);

    await repo.findAllAdmin({ lowStock: true });
    const countQuery = pool.query.mock.calls[0][0];
    expect(countQuery).toContain('p.stock <= 5');
  });

  test('applique le filtre brand', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ id: 1 }]]);

    await repo.findAllAdmin({ brand: 'Vervaco' });
    const countQuery = pool.query.mock.calls[0][0];
    const countParams = pool.query.mock.calls[0][1];
    expect(countQuery).toContain('p.brand = ?');
    expect(countParams).toContain('Vervaco');
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
    // Filtre catégorie lu sur product_categories (ADM-04) — rayons secondaires inclus
    expect(countQuery).toContain('pc.category_id IN');
    expect(countQuery).toContain('p.supplier_id = ?');
    expect(countQuery).toContain('p.price_chf >=');
    expect(countQuery).toContain('p.price_chf <=');
  });

  /* Signalement cliente du 2026-09-16 : en cherchant « 310 » (un coloris de fil
     DMC), les articles portant ce numéro dans leur NOM arrivaient en fin de
     liste, derrière ceux qui ne le portaient que dans leur référence. */
  test('classe par pertinence : le nom prime sur la référence', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ id: 5 }]]);

    await repo.findAllAdmin({ search: '310' });

    const [sql, params] = pool.query.mock.calls[1];
    // Le ORDER BY porte les quatre paliers de pertinence
    expect(sql).toMatch(/ORDER BY[\s\S]*WHEN pt\.name LIKE \? THEN 0/);
    expect(sql).toMatch(/WHEN pt\.name LIKE \? THEN 1/);
    expect(sql).toMatch(/WHEN p\.sku {2}LIKE \? THEN 2/);
    // « commence par », « contient », « référence commence par »
    expect(params).toEqual(expect.arrayContaining(['310%', '%310%']));
  });

  test('sans recherche, aucun classement par pertinence', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ id: 5 }]]);

    await repo.findAllAdmin({});

    expect(pool.query.mock.calls[1][0]).not.toContain('THEN 0');
  });

  test('chaque mot de la recherche pèse sur la pertinence', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ id: 5 }]]);

    await repo.findAllAdmin({ search: 'DMC 310' });

    const sql = pool.query.mock.calls[1][0];
    // Deux termes → deux CASE additionnés
    expect(sql.match(/THEN 0/g)).toHaveLength(2);
    expect(sql).toContain('+');
  });

  test('filtre les articles dont le classement reste à confirmer (ADM-04)', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ id: 5 }]]);

    await repo.findAllAdmin({ needsCategoryReview: true });

    const countQuery  = pool.query.mock.calls[0][0];
    const countParams = pool.query.mock.calls[0][1];
    expect(countQuery).toContain('p.category_needs_review = ?');
    expect(countParams).toContain(1);
  });

  test('sans filtre « à revoir », aucune condition sur le drapeau', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ id: 5 }]]);

    await repo.findAllAdmin({});

    expect(pool.query.mock.calls[0][0]).not.toContain('category_needs_review');
  });
});
