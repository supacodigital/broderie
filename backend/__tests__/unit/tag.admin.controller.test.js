jest.mock('../../services/tag.admin.service', () => ({
  listAll: jest.fn(), getById: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn(),
}));

const service = require('../../services/tag.admin.service');
const controller = require('../../controllers/admin/tag.controller');

beforeEach(() => jest.clearAllMocks());

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

describe('admin/tag.controller — délégation au service', () => {
  test('create : 201 + data', async () => {
    service.create.mockResolvedValue({ id: 2 });
    const res = makeRes();
    await controller.create({ body: { slug: 'promo' } }, res, jest.fn());
    expect(service.create).toHaveBeenCalledWith({ slug: 'promo' });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('create : propage un 400', async () => {
    service.create.mockRejectedValue(Object.assign(new Error('x'), { statusCode: 400 }));
    const next = jest.fn();
    await controller.create({ body: {} }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('update : 200 + data', async () => {
    service.update.mockResolvedValue({ id: 1 });
    const res = makeRes();
    await controller.update({ params: { id: '1' }, body: {} }, res, jest.fn());
    expect(service.update).toHaveBeenCalledWith(1, {});
  });

  test('remove : message de succès', async () => {
    service.remove.mockResolvedValue();
    const res = makeRes();
    await controller.remove({ params: { id: '1' } }, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Tag supprimé.' });
  });
});
