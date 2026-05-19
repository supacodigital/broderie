// Tests unitaires product.service

jest.mock('../../repositories/product.repository', () => ({
  findAll:          jest.fn(),
  findById:         jest.fn(),
  findBySlug:       jest.fn(),
  search:           jest.fn(),
  findByCategoryId: jest.fn(),
}));

jest.mock('../../repositories/category.repository', () => ({
  findBySlug: jest.fn(),
  findAll:    jest.fn(),
}));

jest.mock('../../config/cache', () => ({
  cache: { get: jest.fn(), set: jest.fn() },
  TTL:   { PRODUCTS: 300, PRODUCT: 300 },
  keys:  {
    productsList: jest.fn((...a) => `list:${a.join(':')}`),
    product:      jest.fn((...a) => `product:${a.join(':')}`),
  },
}));

const productRepository  = require('../../repositories/product.repository');
const categoryRepository = require('../../repositories/category.repository');
const { cache }          = require('../../config/cache');
const service            = require('../../services/product.service');

beforeEach(() => jest.clearAllMocks());

// ── getAll() ──────────────────────────────────────────────────────────────────

describe('product.service — getAll()', () => {
  test('retourne la liste depuis la base et la met en cache', async () => {
    cache.get.mockReturnValue(null);
    productRepository.findAll.mockResolvedValue({ rows: [{ id: 1 }], total: 1 });

    const result = await service.getAll({ locale: 'fr', page: '1', limit: '20' });

    expect(result.data).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
    expect(cache.set).toHaveBeenCalled();
  });

  test('retourne le cache si disponible', async () => {
    const cached = { data: [{ id: 99 }], pagination: {} };
    cache.get.mockReturnValue(cached);

    const result = await service.getAll({ locale: 'fr' });
    expect(result).toBe(cached);
    expect(productRepository.findAll).not.toHaveBeenCalled();
  });

  test('applique les filtres minPrice et maxPrice', async () => {
    cache.get.mockReturnValue(null);
    productRepository.findAll.mockResolvedValue({ rows: [], total: 0 });

    await service.getAll({ locale: 'fr', min_price: '10', max_price: '50' });

    const callArgs = productRepository.findAll.mock.calls[0][0];
    expect(callArgs.minPrice).toBe(10);
    expect(callArgs.maxPrice).toBe(50);
  });

  test('applique le filtre inStock', async () => {
    cache.get.mockReturnValue(null);
    productRepository.findAll.mockResolvedValue({ rows: [], total: 0 });

    await service.getAll({ locale: 'fr', in_stock: 'true' });
    expect(productRepository.findAll.mock.calls[0][0].inStock).toBe(true);
  });

  test('applique le filtre featured', async () => {
    cache.get.mockReturnValue(null);
    productRepository.findAll.mockResolvedValue({ rows: [], total: 0 });

    await service.getAll({ locale: 'fr', featured: 'true' });
    expect(productRepository.findAll.mock.calls[0][0].featured).toBe(true);
  });

  test('ignore q si moins de 2 caractères', async () => {
    cache.get.mockReturnValue(null);
    productRepository.findAll.mockResolvedValue({ rows: [], total: 0 });

    await service.getAll({ locale: 'fr', q: 'a' });
    expect(productRepository.findAll.mock.calls[0][0].q).toBeUndefined();
  });

  test('résout le slug catégorie en categoryIds avec enfants', async () => {
    cache.get.mockReturnValue(null);
    categoryRepository.findBySlug.mockResolvedValue({ id: 2, slug: 'fils' });
    categoryRepository.findAll.mockResolvedValue([
      { id: 3, parent_id: 2 },
      { id: 4, parent_id: 2 },
      { id: 5, parent_id: 9 },
    ]);
    productRepository.findAll.mockResolvedValue({ rows: [], total: 0 });

    await service.getAll({ locale: 'fr', category: 'fils' });

    const callArgs = productRepository.findAll.mock.calls[0][0];
    expect(callArgs.categoryIds).toEqual([2, 3, 4]);
    expect(callArgs.categorySlug).toBeUndefined();
  });

  test('résout le slug catégorie sans enfants → categoryIds = [id]', async () => {
    cache.get.mockReturnValue(null);
    categoryRepository.findBySlug.mockResolvedValue({ id: 7, slug: 'aiguilles' });
    categoryRepository.findAll.mockResolvedValue([{ id: 8, parent_id: 1 }]);
    productRepository.findAll.mockResolvedValue({ rows: [], total: 0 });

    await service.getAll({ locale: 'fr', category: 'aiguilles' });
    expect(productRepository.findAll.mock.calls[0][0].categoryIds).toEqual([7]);
  });

  test('lève AppError 404 si catégorie introuvable', async () => {
    cache.get.mockReturnValue(null);
    categoryRepository.findBySlug.mockResolvedValue(null);

    await expect(service.getAll({ locale: 'fr', category: 'inexistant' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('respecte la limite max de 100', async () => {
    cache.get.mockReturnValue(null);
    productRepository.findAll.mockResolvedValue({ rows: [], total: 0 });

    await service.getAll({ locale: 'fr', limit: '999' });
    expect(productRepository.findAll.mock.calls[0][0].limit).toBe(100);
  });
});

// ── getById() ─────────────────────────────────────────────────────────────────

describe('product.service — getById()', () => {
  test('retourne le produit depuis la base et le met en cache', async () => {
    cache.get.mockReturnValue(null);
    const product = { id: 1, slug: 'fil-dmc' };
    productRepository.findById.mockResolvedValue(product);

    const result = await service.getById(1, 'fr');
    expect(result).toBe(product);
    expect(cache.set).toHaveBeenCalled();
  });

  test('retourne le cache si disponible', async () => {
    const cached = { id: 1, slug: 'fil-dmc' };
    cache.get.mockReturnValue(cached);

    const result = await service.getById(1);
    expect(result).toBe(cached);
    expect(productRepository.findById).not.toHaveBeenCalled();
  });

  test('lève AppError 404 si produit introuvable', async () => {
    cache.get.mockReturnValue(null);
    productRepository.findById.mockResolvedValue(null);

    await expect(service.getById(99)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── getBySlug() ───────────────────────────────────────────────────────────────

describe('product.service — getBySlug()', () => {
  test('retourne le produit par slug et le met en cache', async () => {
    cache.get.mockReturnValue(null);
    const product = { id: 1, slug: 'fil-dmc' };
    productRepository.findBySlug.mockResolvedValue(product);

    const result = await service.getBySlug('fil-dmc', 'fr');
    expect(result).toBe(product);
    expect(cache.set).toHaveBeenCalled();
  });

  test('retourne le cache si disponible', async () => {
    const cached = { id: 1, slug: 'fil-dmc' };
    cache.get.mockReturnValue(cached);

    const result = await service.getBySlug('fil-dmc');
    expect(result).toBe(cached);
    expect(productRepository.findBySlug).not.toHaveBeenCalled();
  });

  test('lève AppError 404 si slug introuvable', async () => {
    cache.get.mockReturnValue(null);
    productRepository.findBySlug.mockResolvedValue(null);

    await expect(service.getBySlug('inexistant')).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── search() ──────────────────────────────────────────────────────────────────

describe('product.service — search()', () => {
  test('retourne les résultats paginés', async () => {
    productRepository.search.mockResolvedValue({ rows: [{ id: 1 }], total: 1 });

    const result = await service.search({ q: 'broderie', locale: 'fr', page: '1', limit: '20' });
    expect(result.data).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
    expect(productRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'broderie', locale: 'fr' })
    );
  });

  test('lève AppError 400 si q trop court', async () => {
    await expect(service.search({ q: 'a' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('lève AppError 400 si q absent', async () => {
    await expect(service.search({}))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('respecte la limite max de 100', async () => {
    productRepository.search.mockResolvedValue({ rows: [], total: 0 });
    await service.search({ q: 'fil', locale: 'fr', limit: '999' });
    expect(productRepository.search.mock.calls[0][0].limit).toBe(100);
  });
});

// ── getByCategorySlug() ───────────────────────────────────────────────────────

describe('product.service — getByCategorySlug()', () => {
  test('retourne les produits de la catégorie avec pagination', async () => {
    categoryRepository.findBySlug.mockResolvedValue({ id: 2, slug: 'fils', name: 'Fils' });
    productRepository.findByCategoryId.mockResolvedValue({ rows: [{ id: 1 }], total: 1 });

    const result = await service.getByCategorySlug('fils', { locale: 'fr', page: '1', limit: '20' });
    expect(result.category.slug).toBe('fils');
    expect(result.data).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
  });

  test('lève AppError 404 si catégorie introuvable', async () => {
    categoryRepository.findBySlug.mockResolvedValue(null);

    await expect(service.getByCategorySlug('inexistant', { locale: 'fr' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('applique les paramètres sort et order', async () => {
    categoryRepository.findBySlug.mockResolvedValue({ id: 3 });
    productRepository.findByCategoryId.mockResolvedValue({ rows: [], total: 0 });

    await service.getByCategorySlug('fils', { locale: 'de', sort: 'price_chf', order: 'asc' });
    const call = productRepository.findByCategoryId.mock.calls[0][0];
    expect(call.sort).toBe('price_chf');
    expect(call.order).toBe('asc');
  });
});
