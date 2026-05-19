// Tests unitaires supplier.controller (admin)

jest.mock('../../repositories/supplier.repository', () => ({
  findAll:              jest.fn(),
  findById:             jest.fn(),
  create:               jest.fn(),
  update:               jest.fn(),
  remove:               jest.fn(),
  findByIdWithProducts: jest.fn(),
}));

const supplierRepository = require('../../repositories/supplier.repository');
const controller         = require('../../controllers/admin/supplier.controller');

beforeEach(() => jest.clearAllMocks());

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

const fakeSupplier = { id: 1, name: 'DMC France', email: 'contact@dmc.fr', is_active: 1 };

// ── getAll() ──────────────────────────────────────────────────────────────────

describe('supplier.admin.controller — getAll()', () => {
  test('retourne la liste paginée des fournisseurs', async () => {
    supplierRepository.findAll.mockResolvedValue({ rows: [fakeSupplier], total: 1 });

    const req = { query: {} };
    const res = makeRes();
    await controller.getAll(req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(res.json.mock.calls[0][0].pagination.total).toBe(1);
  });

  test('respecte la limite max 100', async () => {
    supplierRepository.findAll.mockResolvedValue({ rows: [], total: 0 });

    const req = { query: { limit: '500' } };
    const res = makeRes();
    await controller.getAll(req, res, jest.fn());

    expect(supplierRepository.findAll.mock.calls[0][0].limit).toBe(100);
  });

  test('passe le paramètre de recherche', async () => {
    supplierRepository.findAll.mockResolvedValue({ rows: [], total: 0 });

    const req = { query: { q: 'DMC' } };
    const res = makeRes();
    await controller.getAll(req, res, jest.fn());

    expect(supplierRepository.findAll.mock.calls[0][0].search).toBe('DMC');
  });
});

// ── getById() ─────────────────────────────────────────────────────────────────

describe('supplier.admin.controller — getById()', () => {
  test('retourne le fournisseur', async () => {
    supplierRepository.findById.mockResolvedValue(fakeSupplier);

    const req = { params: { id: '1' } };
    const res = makeRes();
    const next = jest.fn();
    await controller.getById(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeSupplier });
  });

  test('retourne 404 si introuvable', async () => {
    supplierRepository.findById.mockResolvedValue(null);

    const req = { params: { id: '999' } };
    const res = makeRes();
    const next = jest.fn();
    await controller.getById(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

// ── create() ──────────────────────────────────────────────────────────────────

describe('supplier.admin.controller — create()', () => {
  test('crée le fournisseur et retourne 201', async () => {
    supplierRepository.create.mockResolvedValue(5);
    supplierRepository.findById.mockResolvedValue({ ...fakeSupplier, id: 5 });

    const req = { body: { name: 'Anchor', email: 'anchor@test.com' } };
    const res = makeRes();
    const next = jest.fn();
    await controller.create(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('retourne 400 si le nom est absent', async () => {
    const req = { body: { email: 'anchor@test.com' } };
    const res = makeRes();
    const next = jest.fn();
    await controller.create(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('retourne 400 si le nom est une chaîne vide', async () => {
    const req = { body: { name: '' } };
    const res = makeRes();
    const next = jest.fn();
    await controller.create(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});

// ── update() ──────────────────────────────────────────────────────────────────

describe('supplier.admin.controller — update()', () => {
  test('met à jour le fournisseur', async () => {
    supplierRepository.findById.mockResolvedValue(fakeSupplier);
    supplierRepository.update.mockResolvedValue({ ...fakeSupplier, name: 'DMC Updated' });

    const req = { params: { id: '1' }, body: { name: 'DMC Updated', isActive: true } };
    const res = makeRes();
    const next = jest.fn();
    await controller.update(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('retourne 404 si fournisseur introuvable', async () => {
    supplierRepository.findById.mockResolvedValue(null);

    const req = { params: { id: '999' }, body: { name: 'X' } };
    const res = makeRes();
    const next = jest.fn();
    await controller.update(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

// ── remove() ──────────────────────────────────────────────────────────────────

describe('supplier.admin.controller — remove()', () => {
  test('supprime le fournisseur', async () => {
    supplierRepository.remove.mockResolvedValue(true);

    const req = { params: { id: '1' } };
    const res = makeRes();
    const next = jest.fn();
    await controller.remove(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('retourne 404 si fournisseur introuvable', async () => {
    supplierRepository.remove.mockResolvedValue(false);

    const req = { params: { id: '999' } };
    const res = makeRes();
    const next = jest.fn();
    await controller.remove(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

// ── getDetails() ──────────────────────────────────────────────────────────────

describe('supplier.admin.controller — getDetails()', () => {
  test('retourne le fournisseur avec ses produits', async () => {
    const details = { ...fakeSupplier, products: [{ id: 1, slug: 'fil-dmc' }] };
    supplierRepository.findByIdWithProducts.mockResolvedValue(details);

    const req = { params: { id: '1' } };
    const res = makeRes();
    const next = jest.fn();
    await controller.getDetails(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: details });
  });

  test('retourne 404 si introuvable', async () => {
    supplierRepository.findByIdWithProducts.mockResolvedValue(null);

    const req = { params: { id: '999' } };
    const res = makeRes();
    const next = jest.fn();
    await controller.getDetails(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});
