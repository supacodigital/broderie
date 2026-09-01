jest.mock('../../services/category.admin.service', () => ({
  listAll: jest.fn(), getById: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn(),
}));

const service = require('../../services/category.admin.service');
const controller = require('../../controllers/admin/category.controller');

beforeEach(() => jest.clearAllMocks());

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

describe('admin/category.controller — délégation au service', () => {
  test('create : 201 + data', async () => {
    service.create.mockResolvedValue({ id: 5 });
    const res = makeRes();
    await controller.create({ body: { slug: 'x' } }, res, jest.fn());
    expect(service.create).toHaveBeenCalledWith({ slug: 'x' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 5 } });
  });

  test('create : propage l\'erreur du service (409)', async () => {
    service.create.mockRejectedValue(Object.assign(new Error('dup'), { statusCode: 409 }));
    const next = jest.fn();
    await controller.create({ body: {} }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });

  test('update : 200 + data', async () => {
    service.update.mockResolvedValue({ id: 3 });
    const res = makeRes();
    await controller.update({ params: { id: '3' }, body: {} }, res, jest.fn());
    expect(service.update).toHaveBeenCalledWith(3, {});
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 3 } });
  });

  test('remove : message de succès', async () => {
    service.remove.mockResolvedValue();
    const res = makeRes();
    await controller.remove({ params: { id: '3' } }, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Catégorie supprimée.' });
  });

  test('getById : propage un 404 du service', async () => {
    service.getById.mockRejectedValue(Object.assign(new Error('x'), { statusCode: 404 }));
    const next = jest.fn();
    await controller.getById({ params: { id: '99' } }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});
