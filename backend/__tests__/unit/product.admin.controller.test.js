// Tests unitaires product.controller (admin)

jest.mock('../../repositories/product.admin.repository', () => ({
  findAllAdmin:   jest.fn(),
  findByIdAdmin:  jest.fn(),
  create:         jest.fn(),
  update:         jest.fn(),
  softDelete:     jest.fn(),
  addImage:       jest.fn(),
  removeImage:    jest.fn(),
  setPrimaryImage: jest.fn(),
}));

jest.mock('../../config/sharp', () => ({
  processImage: jest.fn(),
}));

jest.mock('../../config/cache', () => ({
  invalidateProducts: jest.fn(),
}));

jest.mock('../../utils/locale.utils', () => ({
  normalizeLocale: jest.fn((l) => l || 'fr'),
}));

const productAdminRepository = require('../../repositories/product.admin.repository');
const { processImage }       = require('../../config/sharp');
const { invalidateProducts } = require('../../config/cache');
const controller             = require('../../controllers/admin/product.controller');

beforeEach(() => jest.clearAllMocks());

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

const fakeProduct = { id: 1, slug: 'fil-dmc', price_chf: 9.80 };

const validBody = {
  categoryId:   1,
  supplierId:   null,
  slug:         'fil-dmc-rouge',
  priceChf:     9.80,
  taxRateId:    1,
  stock:        50,
  isFeatured:   false,
  translations: {
    fr: { name: 'Fil DMC Rouge', description: 'Beau fil', slug: 'fil-dmc-rouge' },
  },
};

// ── getAll() ──────────────────────────────────────────────────────────────────

describe('product.admin.controller — getAll()', () => {
  test('retourne la liste paginée', async () => {
    productAdminRepository.findAllAdmin.mockResolvedValue({ rows: [fakeProduct], total: 1 });

    const req = { query: {} };
    const res = makeRes();
    await controller.getAll(req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(res.json.mock.calls[0][0].pagination.total).toBe(1);
  });

  test('filtre is_active=true', async () => {
    productAdminRepository.findAllAdmin.mockResolvedValue({ rows: [], total: 0 });

    const req = { query: { is_active: 'true' } };
    const res = makeRes();
    await controller.getAll(req, res, jest.fn());

    expect(productAdminRepository.findAllAdmin.mock.calls[0][0].isActive).toBe(true);
  });

  test('filtre is_active=false', async () => {
    productAdminRepository.findAllAdmin.mockResolvedValue({ rows: [], total: 0 });

    const req = { query: { is_active: 'false' } };
    const res = makeRes();
    await controller.getAll(req, res, jest.fn());

    expect(productAdminRepository.findAllAdmin.mock.calls[0][0].isActive).toBe(false);
  });

  test('is_active null si absent du query', async () => {
    productAdminRepository.findAllAdmin.mockResolvedValue({ rows: [], total: 0 });

    const req = { query: {} };
    const res = makeRes();
    await controller.getAll(req, res, jest.fn());

    expect(productAdminRepository.findAllAdmin.mock.calls[0][0].isActive).toBeNull();
  });

  test('filtre is_featured=true', async () => {
    productAdminRepository.findAllAdmin.mockResolvedValue({ rows: [], total: 0 });

    const req = { query: { is_featured: 'true' } };
    const res = makeRes();
    await controller.getAll(req, res, jest.fn());

    expect(productAdminRepository.findAllAdmin.mock.calls[0][0].isFeatured).toBe(true);
  });

  test('ignore sort invalide — fallback "created_at"', async () => {
    productAdminRepository.findAllAdmin.mockResolvedValue({ rows: [], total: 0 });

    const req = { query: { sort: 'DROP_TABLE' } };
    const res = makeRes();
    await controller.getAll(req, res, jest.fn());

    expect(productAdminRepository.findAllAdmin.mock.calls[0][0].sort).toBe('created_at');
  });

  test('accepte sort "price_chf"', async () => {
    productAdminRepository.findAllAdmin.mockResolvedValue({ rows: [], total: 0 });

    const req = { query: { sort: 'price_chf' } };
    const res = makeRes();
    await controller.getAll(req, res, jest.fn());

    expect(productAdminRepository.findAllAdmin.mock.calls[0][0].sort).toBe('price_chf');
  });
});

// ── getById() ─────────────────────────────────────────────────────────────────

describe('product.admin.controller — getById()', () => {
  test('retourne le produit', async () => {
    productAdminRepository.findByIdAdmin.mockResolvedValue(fakeProduct);

    const req = { params: { id: '1' }, query: {} };
    const res = makeRes();
    const next = jest.fn();
    await controller.getById(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeProduct });
  });

  test('retourne 404 si introuvable', async () => {
    productAdminRepository.findByIdAdmin.mockResolvedValue(null);

    const req = { params: { id: '999' }, query: {} };
    const res = makeRes();
    const next = jest.fn();
    await controller.getById(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

// ── create() ──────────────────────────────────────────────────────────────────

describe('product.admin.controller — create()', () => {
  test('crée le produit et retourne 201', async () => {
    productAdminRepository.create.mockResolvedValue(99);
    productAdminRepository.findByIdAdmin.mockResolvedValue({ ...fakeProduct, id: 99 });

    const req = { body: validBody };
    const res = makeRes();
    const next = jest.fn();
    await controller.create(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(invalidateProducts).toHaveBeenCalled();
  });

  test('retourne 400 si données invalides (slug absent)', async () => {
    const req = { body: { ...validBody, slug: undefined } };
    const res = makeRes();
    const next = jest.fn();
    await controller.create(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });

  test('retourne 400 si priceChf négatif', async () => {
    const req = { body: { ...validBody, priceChf: -5 } };
    const res = makeRes();
    const next = jest.fn();
    await controller.create(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retourne 400 si translation fr absente', async () => {
    const req = { body: { ...validBody, translations: {} } };
    const res = makeRes();
    const next = jest.fn();
    await controller.create(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── update() ──────────────────────────────────────────────────────────────────

describe('product.admin.controller — update()', () => {
  test('met à jour le produit', async () => {
    productAdminRepository.update.mockResolvedValue();
    productAdminRepository.findByIdAdmin.mockResolvedValue(fakeProduct);

    const req = { params: { id: '1' }, body: { priceChf: 12.50 } };
    const res = makeRes();
    const next = jest.fn();
    await controller.update(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeProduct });
    expect(invalidateProducts).toHaveBeenCalled();
  });

  test('retourne 400 si id invalide (0)', async () => {
    const req = { params: { id: '0' }, body: {} };
    const res = makeRes();
    const next = jest.fn();
    await controller.update(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('retourne 404 si produit introuvable après update', async () => {
    productAdminRepository.update.mockResolvedValue();
    productAdminRepository.findByIdAdmin.mockResolvedValue(null);

    const req = { params: { id: '1' }, body: { priceChf: 5 } };
    const res = makeRes();
    const next = jest.fn();
    await controller.update(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

// ── remove() ──────────────────────────────────────────────────────────────────

describe('product.admin.controller — remove()', () => {
  test('supprime le produit et retourne 200', async () => {
    productAdminRepository.softDelete.mockResolvedValue();

    const req = { params: { id: '1' } };
    const res = makeRes();
    await controller.remove(req, res, jest.fn());

    expect(productAdminRepository.softDelete).toHaveBeenCalledWith(1);
    expect(invalidateProducts).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ── uploadImage() ─────────────────────────────────────────────────────────────

describe('product.admin.controller — uploadImage()', () => {
  test('upload l\'image et retourne 201 avec les URLs', async () => {
    processImage.mockResolvedValue({
      urls: { large: 'https://cloud.example.com/large.webp', medium: '...', thumbnail: '...' },
    });
    productAdminRepository.addImage.mockResolvedValue(10);

    const req = {
      params: { id: '1' },
      file:   { buffer: Buffer.from('fake-image') },
      body:   { isPrimary: 'true', alt: 'Photo produit', sortOrder: '0' },
    };
    const res = makeRes();
    const next = jest.fn();
    await controller.uploadImage(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].data.url).toContain('large.webp');
  });

  test('retourne 400 si aucun fichier reçu', async () => {
    const req = { params: { id: '1' }, file: null, body: {} };
    const res = makeRes();
    const next = jest.fn();
    await controller.uploadImage(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});

// ── removeImage() ─────────────────────────────────────────────────────────────

describe('product.admin.controller — removeImage()', () => {
  test('supprime l\'image', async () => {
    productAdminRepository.removeImage.mockResolvedValue(true);

    const req = { params: { id: '1', imageId: '5' } };
    const res = makeRes();
    const next = jest.fn();
    await controller.removeImage(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('retourne 404 si image introuvable', async () => {
    productAdminRepository.removeImage.mockResolvedValue(false);

    const req = { params: { id: '1', imageId: '999' } };
    const res = makeRes();
    const next = jest.fn();
    await controller.removeImage(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

// ── setPrimaryImage() ─────────────────────────────────────────────────────────

describe('product.admin.controller — setPrimaryImage()', () => {
  test('définit l\'image principale', async () => {
    productAdminRepository.setPrimaryImage.mockResolvedValue(true);

    const req = { params: { id: '1', imageId: '3' } };
    const res = makeRes();
    const next = jest.fn();
    await controller.setPrimaryImage(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('retourne 404 si image introuvable', async () => {
    productAdminRepository.setPrimaryImage.mockResolvedValue(false);

    const req = { params: { id: '1', imageId: '999' } };
    const res = makeRes();
    const next = jest.fn();
    await controller.setPrimaryImage(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});
