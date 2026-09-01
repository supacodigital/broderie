jest.mock('../../repositories/product.admin.repository');
jest.mock('../../config/sharp', () => ({ processImage: jest.fn() }));
jest.mock('../../config/cache', () => ({ invalidateProducts: jest.fn() }));

const repo = require('../../repositories/product.admin.repository');
const { processImage } = require('../../config/sharp');
const service = require('../../services/product.admin.service');

beforeEach(() => jest.clearAllMocks());

const validBody = {
  categoryId: 1, slug: 'kit-broderie', priceChf: 29.9, taxRateId: 1,
  translations: { fr: { name: 'Kit de broderie' } },
};

describe('product.admin.service — create()', () => {
  test('crée le produit et retourne le détail', async () => {
    repo.skuExists.mockResolvedValue(false);
    repo.slugExists.mockResolvedValue(false);
    repo.create.mockResolvedValue(9);
    repo.findByIdAdmin.mockResolvedValue({ id: 9 });

    const res = await service.create(validBody);
    expect(res.id).toBe(9);
  });

  test('400 si le prix est négatif', async () => {
    await expect(service.create({ ...validBody, priceChf: -1 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('400 si la traduction FR est absente', async () => {
    await expect(service.create({ ...validBody, translations: {} }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('409 si le SKU existe déjà', async () => {
    repo.skuExists.mockResolvedValue(true);
    await expect(service.create({ ...validBody, sku: 'ABC' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('rend le slug unique automatiquement en cas de collision', async () => {
    repo.skuExists.mockResolvedValue(false);
    repo.slugExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false); // kit-broderie pris, kit-broderie-2 libre
    repo.create.mockResolvedValue(10);
    repo.findByIdAdmin.mockResolvedValue({ id: 10 });

    await service.create(validBody);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'kit-broderie-2' }));
  });
});

describe('product.admin.service — update()', () => {
  test('400 si l\'id est invalide', async () => {
    await expect(service.update(0, validBody)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('409 si slug ou SKU en conflit', async () => {
    repo.slugExists.mockResolvedValue(true);
    await expect(service.update(1, { slug: 'pris' })).rejects.toMatchObject({ statusCode: 409 });
  });

  test('404 si le produit n\'existe plus après update', async () => {
    repo.slugExists.mockResolvedValue(false);
    repo.skuExists.mockResolvedValue(false);
    repo.update.mockResolvedValue();
    repo.findByIdAdmin.mockResolvedValue(null);
    await expect(service.update(1, { priceChf: 10 })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('product.admin.service — addImage()', () => {
  test('400 sans fichier', async () => {
    await expect(service.addImage(1, null)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('404 si le produit n\'existe pas', async () => {
    repo.findByIdAdmin.mockResolvedValue(null);
    await expect(service.addImage(999, { buffer: Buffer.from('x') })).rejects.toMatchObject({ statusCode: 404 });
    expect(processImage).not.toHaveBeenCalled();
  });

  test('convertit via sharp et enregistre', async () => {
    repo.findByIdAdmin.mockResolvedValue({ id: 1 });
    processImage.mockResolvedValue({ urls: { thumbnail: 't', medium: 'm', large: 'l' } });
    repo.addImage.mockResolvedValue(3);
    const res = await service.addImage(1, { buffer: Buffer.from('x') }, { isPrimary: true });
    expect(processImage).toHaveBeenCalled();
    expect(res).toEqual({ id: 3, url: 'l', alt: null, is_primary: 1, sort_order: 0 });
  });
});

describe('product.admin.service — image mutations', () => {
  test('removeImage : 404 si absent', async () => {
    repo.removeImage.mockResolvedValue(false);
    await expect(service.removeImage(1, 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('setPrimaryImage : 404 si absent', async () => {
    repo.setPrimaryImage.mockResolvedValue(false);
    await expect(service.setPrimaryImage(1, 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('updateFeaturedOrder : 400 si liste vide', async () => {
    await expect(service.updateFeaturedOrder({ productIds: [] })).rejects.toMatchObject({ statusCode: 400 });
  });
});
