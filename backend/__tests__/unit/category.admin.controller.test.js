// Tests unitaires admin/category.controller

jest.mock('../../repositories/category.admin.repository', () => ({
  findAll:    jest.fn(),
  findById:   jest.fn(),
  create:     jest.fn(),
  update:     jest.fn(),
  remove:     jest.fn(),
  slugExists: jest.fn(),
}));

jest.mock('../../config/cache', () => ({
  cache: {
    keys: jest.fn().mockReturnValue([]),
    del:  jest.fn(),
  },
  keys: {},
  TTL: {},
}));

const categoryAdminRepository = require('../../repositories/category.admin.repository');
const { cache } = require('../../config/cache');
const { getAll, getById, create, update, remove } = require('../../controllers/admin/category.controller');

beforeEach(() => jest.clearAllMocks());

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

// ── getAll() ──────────────────────────────────────────────────────────────────

describe('admin/category.controller — getAll()', () => {
  test('retourne toutes les catégories', async () => {
    const cats = [{ id: 1, slug: 'fils' }];
    categoryAdminRepository.findAll.mockResolvedValue(cats);
    const res = makeRes();
    await getAll({}, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, data: cats });
  });
});

// ── getById() ─────────────────────────────────────────────────────────────────

describe('admin/category.controller — getById()', () => {
  test('retourne la catégorie par id', async () => {
    const cat = { id: 1, slug: 'fils' };
    categoryAdminRepository.findById.mockResolvedValue(cat);
    const req = { params: { id: '1' } };
    const res = makeRes();
    await getById(req, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, data: cat });
  });

  test('retourne 404 si introuvable', async () => {
    categoryAdminRepository.findById.mockResolvedValue(null);
    const req = { params: { id: '99' } };
    const res = makeRes();
    const next = jest.fn();
    await getById(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

// ── create() ─────────────────────────────────────────────────────────────────

describe('admin/category.controller — create()', () => {
  test('crée la catégorie, invalide le cache et retourne 201', async () => {
    categoryAdminRepository.slugExists.mockResolvedValue(false);
    categoryAdminRepository.create.mockResolvedValue(5);
    const newCat = { id: 5, slug: 'fils-dmc' };
    categoryAdminRepository.findById.mockResolvedValue(newCat);
    cache.keys.mockReturnValue(['categories:fr', 'categories:de']);

    const req = {
      body: {
        slug: 'fils-dmc',
        translations: { fr: { name: 'Fils DMC' } },
      },
    };
    const res = makeRes();
    await create(req, res, jest.fn());

    expect(cache.del).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: newCat });
  });

  test('retourne 400 si slug manquant', async () => {
    const req = { body: { translations: { fr: { name: 'Test' } } } };
    const res = makeRes();
    const next = jest.fn();
    await create(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('retourne 400 si traduction FR manquante', async () => {
    const req = { body: { slug: 'test', translations: { de: { name: 'Test' } } } };
    const res = makeRes();
    const next = jest.fn();
    await create(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('retourne 409 si slug déjà utilisé', async () => {
    categoryAdminRepository.slugExists.mockResolvedValue(true);
    const req = { body: { slug: 'fils', translations: { fr: { name: 'Fils' } } } };
    const res = makeRes();
    const next = jest.fn();
    await create(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });
});

// ── update() ──────────────────────────────────────────────────────────────────

describe('admin/category.controller — update()', () => {
  test('met à jour la catégorie et invalide le cache', async () => {
    categoryAdminRepository.findById
      .mockResolvedValueOnce({ id: 1, slug: 'fils' }) // vérification existence
      .mockResolvedValueOnce({ id: 1, slug: 'fils-updated' }); // après update
    categoryAdminRepository.slugExists.mockResolvedValue(false);
    categoryAdminRepository.update.mockResolvedValue();
    cache.keys.mockReturnValue([]);

    const req = { params: { id: '1' }, body: { slug: 'fils-updated', translations: {} } };
    const res = makeRes();
    await update(req, res, jest.fn());
    expect(categoryAdminRepository.update).toHaveBeenCalledWith(1, expect.any(Object));
    expect(res.json).toHaveBeenCalledWith({ success: true, data: expect.any(Object) });
  });

  test('retourne 400 si slug manquant', async () => {
    const req = { params: { id: '1' }, body: {} };
    const res = makeRes();
    const next = jest.fn();
    await update(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('retourne 404 si catégorie inexistante', async () => {
    categoryAdminRepository.findById.mockResolvedValue(null);
    const req = { params: { id: '99' }, body: { slug: 'fils' } };
    const res = makeRes();
    const next = jest.fn();
    await update(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('retourne 409 si slug pris par une autre catégorie', async () => {
    categoryAdminRepository.findById.mockResolvedValue({ id: 1 });
    categoryAdminRepository.slugExists.mockResolvedValue(true);
    const req = { params: { id: '1' }, body: { slug: 'fils-existant' } };
    const res = makeRes();
    const next = jest.fn();
    await update(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });
});

// ── remove() ─────────────────────────────────────────────────────────────────

describe('admin/category.controller — remove()', () => {
  test('supprime la catégorie et retourne succès', async () => {
    categoryAdminRepository.remove.mockResolvedValue();
    cache.keys.mockReturnValue([]);
    const req = { params: { id: '1' } };
    const res = makeRes();
    await remove(req, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Catégorie supprimée.' });
  });

  test('retourne 400 si catégorie a des produits liés', async () => {
    categoryAdminRepository.remove.mockRejectedValue(new Error('Impossible de supprimer : produits liés.'));
    const req = { params: { id: '2' } };
    const res = makeRes();
    const next = jest.fn();
    await remove(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('appelle next avec l\'erreur générique si non métier', async () => {
    categoryAdminRepository.remove.mockRejectedValue(new Error('DB crash'));
    const req = { params: { id: '2' } };
    const res = makeRes();
    const next = jest.fn();
    await remove(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'DB crash' }));
  });
});
