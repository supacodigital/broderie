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

  /* Agrégation des comptages sur la descendance (ADM-04) — la partie subtile :
     le SQL renvoie les rattachements bruts, la remontée vers les ancêtres et le
     dédoublonnage se font en JS. */
  test('agrège les comptages des enfants vers leurs ancêtres', async () => {
    pool.execute
      // 1er appel : l'arbre (racine 1 → enfant 10 → petit-enfant 100)
      .mockResolvedValueOnce([[
        { id: 1,   parent_id: null, slug: 'broderie',   sort_order: 1 },
        { id: 10,  parent_id: 1,    slug: 'kits',       sort_order: 1 },
        { id: 100, parent_id: 10,   slug: 'point-croix', sort_order: 1 },
        { id: 2,   parent_id: null, slug: 'fils',       sort_order: 2 },
      ]])
      // 2e appel : un couple (produit, catégorie) par rattachement
      .mockResolvedValueOnce([[
        { category_id: 10,  product_id: 1, category_needs_review: 1 },
        { category_id: 10,  product_id: 2, category_needs_review: 0 },
        { category_id: 100, product_id: 3, category_needs_review: 1 },
        { category_id: 2,   product_id: 4, category_needs_review: 0 },
      ]]);
    pool.query.mockResolvedValue([[]]);

    const byId = Object.fromEntries((await repo.findAll()).map(c => [c.id, c]));

    // La racine cumule ses deux niveaux de descendance
    expect(byId[1].product_count).toBe(3);
    expect(byId[1].review_count).toBe(2);
    // L'intermédiaire cumule son propre total et celui de son enfant
    expect(byId[10].product_count).toBe(3);
    // La feuille ne compte qu'elle-même
    expect(byId[100].product_count).toBe(1);
    // Une racine sans enfant garde son comptage direct
    expect(byId[2].product_count).toBe(1);
    expect(byId[2].review_count).toBe(0);
  });

  /* Non-régression : l'import conserve le rayon d'origine quand la cliente
     affine un classement, donc un produit est souvent rattaché à une catégorie
     ET à sa parente. Une addition de comptages le comptait deux fois et gonflait
     le rayon Broderie à 15 825 produits — plus que le catalogue entier. */
  test('ne compte pas deux fois un produit rattaché à une catégorie et à sa parente', async () => {
    pool.execute
      .mockResolvedValueOnce([[
        { id: 1,   parent_id: null, slug: 'broderie', sort_order: 1 },
        { id: 10,  parent_id: 1,    slug: 'kits',     sort_order: 1 },
      ]])
      .mockResolvedValueOnce([[
        // Le produit 1 est dans le rayon ET dans sa sous-catégorie
        { category_id: 1,  product_id: 1, category_needs_review: 1 },
        { category_id: 10, product_id: 1, category_needs_review: 1 },
        { category_id: 10, product_id: 2, category_needs_review: 0 },
      ]]);
    pool.query.mockResolvedValue([[]]);

    const byId = Object.fromEntries((await repo.findAll()).map(c => [c.id, c]));

    // 2 produits distincts, pas 3
    expect(byId[1].product_count).toBe(2);
    expect(byId[1].review_count).toBe(1);
    expect(byId[10].product_count).toBe(2);
  });

  test('catégorie sans aucun produit : comptages à zéro', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ id: 5, parent_id: null, slug: 'vide', sort_order: 1 }]])
      .mockResolvedValueOnce([[]]);
    pool.query.mockResolvedValue([[]]);

    const [cat] = await repo.findAll();
    expect(cat.product_count).toBe(0);
    expect(cat.review_count).toBe(0);
  });

  /* Une boucle parent/enfant en base (donnée corrompue) ne doit pas faire
     tourner la remontée à l'infini et figer l'administration. */
  test('une boucle dans la hiérarchie ne bloque pas la requête', async () => {
    pool.execute
      .mockResolvedValueOnce([[
        { id: 1, parent_id: 2, slug: 'a', sort_order: 1 },
        { id: 2, parent_id: 1, slug: 'b', sort_order: 2 },
      ]])
      .mockResolvedValueOnce([[
        { category_id: 1, product_id: 7, category_needs_review: 1 },
      ]]);
    pool.query.mockResolvedValue([[]]);

    const result = await repo.findAll();
    expect(result).toHaveLength(2);
    // Le produit est compté une seule fois de chaque côté de la boucle
    expect(result.find(c => c.id === 1).product_count).toBe(1);
    expect(result.find(c => c.id === 2).product_count).toBe(1);
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
  test('lève une erreur si des sous-catégories sont rattachées', async () => {
    pool.execute.mockResolvedValueOnce([[{ total: 2 }]]); // 1er check : sous-catégories
    await expect(repo.remove(1)).rejects.toThrow(/2 sous-catégorie/);
  });

  test('lève une erreur si des produits sont liés', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ total: 0 }]])  // sous-catégories : ok
      .mockResolvedValueOnce([[{ total: 3 }]]); // produits liés
    await expect(repo.remove(1)).rejects.toThrow(/3 produit/);
  });

  test('supprime la catégorie et ses traductions si rien n\'est lié', async () => {
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
