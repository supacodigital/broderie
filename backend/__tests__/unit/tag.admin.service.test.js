jest.mock('../../repositories/tag.admin.repository');
jest.mock('../../config/cache', () => ({ cache: { keys: () => [], del: jest.fn() } }));

const repo = require('../../repositories/tag.admin.repository');
const service = require('../../services/tag.admin.service');

beforeEach(() => jest.clearAllMocks());

const validBody = { slug: 'promo', translations: { fr: { name: 'Promotion' } } };

describe('tag.admin.service', () => {
  test('create : succès', async () => {
    repo.slugExists.mockResolvedValue(false);
    repo.create.mockResolvedValue(2);
    repo.findById.mockResolvedValue({ id: 2, slug: 'promo' });
    const res = await service.create(validBody);
    expect(res.id).toBe(2);
  });

  test('create : 400 si slug manquant', async () => {
    await expect(service.create({ translations: { fr: { name: 'X' } } }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('create : 400 si traduction FR manquante', async () => {
    await expect(service.create({ slug: 'x' })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('create : 409 si slug pris', async () => {
    repo.slugExists.mockResolvedValue(true);
    await expect(service.create(validBody)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('update : 404 si le tag n\'existe pas', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.update(1, validBody)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('getById : 404 si absent', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.getById(9)).rejects.toMatchObject({ statusCode: 404 });
  });
});
