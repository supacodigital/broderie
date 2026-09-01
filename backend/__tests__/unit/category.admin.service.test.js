jest.mock('../../repositories/category.admin.repository');
jest.mock('../../config/cache', () => ({ cache: { keys: () => [], del: jest.fn() } }));

const repo = require('../../repositories/category.admin.repository');
const service = require('../../services/category.admin.service');

beforeEach(() => jest.clearAllMocks());

const validBody = {
  slug: 'fils-a-broder',
  translations: { fr: { name: 'Fils à broder' } },
};

describe('category.admin.service — create()', () => {
  test('crée la catégorie et retourne le résultat', async () => {
    repo.slugExists.mockResolvedValue(false);
    repo.create.mockResolvedValue(7);
    repo.findById.mockResolvedValue({ id: 7, slug: 'fils-a-broder' });

    const res = await service.create(validBody);
    expect(res.id).toBe(7);
    expect(repo.create).toHaveBeenCalled();
  });

  test('400 si slug manquant', async () => {
    await expect(service.create({ translations: { fr: { name: 'X' } } }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('400 si traduction FR manquante', async () => {
    await expect(service.create({ slug: 'x', translations: {} }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('409 si le slug est déjà pris', async () => {
    repo.slugExists.mockResolvedValue(true);
    await expect(service.create(validBody)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('400 si erreur métier de hiérarchie', async () => {
    repo.slugExists.mockResolvedValue(false);
    repo.create.mockRejectedValue(new Error('Profondeur maximale atteinte'));
    await expect(service.create(validBody)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('category.admin.service — update()', () => {
  test('404 si la catégorie n\'existe pas', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.update(1, validBody)).rejects.toMatchObject({ statusCode: 404 });
  });

  test('409 si le slug est pris par une autre catégorie', async () => {
    repo.findById.mockResolvedValue({ id: 1 });
    repo.slugExists.mockResolvedValue(true);
    await expect(service.update(1, validBody)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('met à jour et retourne la catégorie', async () => {
    repo.findById.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 1, slug: 'fils-a-broder' });
    repo.slugExists.mockResolvedValue(false);
    repo.update.mockResolvedValue();
    const res = await service.update(1, validBody);
    expect(res.slug).toBe('fils-a-broder');
  });
});

describe('category.admin.service — remove()', () => {
  test('400 si des éléments sont encore liés', async () => {
    repo.remove.mockRejectedValue(new Error('Impossible de supprimer : 3 produit(s) lié(s)'));
    await expect(service.remove(1)).rejects.toMatchObject({ statusCode: 400 });
  });

  test('succès', async () => {
    repo.remove.mockResolvedValue();
    await expect(service.remove(1)).resolves.toBeUndefined();
  });
});
