jest.mock('../../services/product.admin.service', () => ({
  list: jest.fn(), getById: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn(),
  addImage: jest.fn(), removeImage: jest.fn(), setPrimaryImage: jest.fn(), updateFeaturedOrder: jest.fn(),
}));
jest.mock('../../utils/locale.utils', () => ({ normalizeLocale: (l) => l || 'fr' }));

const service = require('../../services/product.admin.service');
const controller = require('../../controllers/admin/product.controller');

beforeEach(() => jest.clearAllMocks());

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

describe('admin/product.controller — délégation au service', () => {
  test('getAll : passe req.query au service et renvoie data + pagination', async () => {
    service.list.mockResolvedValue({ data: [{ id: 1 }], pagination: { page: 1 } });
    const res = makeRes();
    await controller.getAll({ query: { page: '1' } }, res, jest.fn());
    expect(service.list).toHaveBeenCalledWith({ page: '1' });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ id: 1 }], pagination: { page: 1 } });
  });

  test('create : 201 + data', async () => {
    service.create.mockResolvedValue({ id: 9 });
    const res = makeRes();
    await controller.create({ body: { slug: 'x' } }, res, jest.fn());
    // L'auteur alimente le prix de départ de l'historique des prix (ADM-21)
    expect(service.create).toHaveBeenCalledWith({ slug: 'x' }, { changedBy: null });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('create : propage un 400', async () => {
    service.create.mockRejectedValue(Object.assign(new Error('x'), { statusCode: 400 }));
    const next = jest.fn();
    await controller.create({ body: {} }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('update : 200 + data', async () => {
    service.update.mockResolvedValue({ id: 3 });
    const res = makeRes();
    await controller.update({ params: { id: '3' }, body: {} }, res, jest.fn());
    // `changedBy` alimente l'historique des prix (ADM-21) — null hors session admin
    expect(service.update).toHaveBeenCalledWith(3, {}, { changedBy: null });
  });

  /* L'historique doit nommer l'auteur du changement : c'est ce qui distingue une
     décision commerciale d'une modification venue d'un import (ADM-21). */
  test("update : transmet l'admin connecté au service", async () => {
    service.update.mockResolvedValue({ id: 3 });
    const res = makeRes();
    await controller.update({ params: { id: '3' }, body: {}, user: { id: 42 } }, res, jest.fn());
    expect(service.update).toHaveBeenCalledWith(3, {}, { changedBy: 42 });
  });

  test('uploadImage : passe le fichier et les options au service', async () => {
    service.addImage.mockResolvedValue({ id: 1, url: 'u' });
    const res = makeRes();
    const req = { params: { id: '3' }, file: { buffer: Buffer.from('x') }, body: { isPrimary: 'true', alt: 'A', sortOrder: '2' } };
    await controller.uploadImage(req, res, jest.fn());
    expect(service.addImage).toHaveBeenCalledWith(3, req.file, { isPrimary: true, alt: 'A', sortOrder: 2 });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('updateFeaturedOrder : délègue le body', async () => {
    service.updateFeaturedOrder.mockResolvedValue();
    const res = makeRes();
    await controller.updateFeaturedOrder({ body: { productIds: [1, 2] } }, res, jest.fn());
    expect(service.updateFeaturedOrder).toHaveBeenCalledWith({ productIds: [1, 2] });
  });
});
