// Tests unitaires admin/coupon.controller

jest.mock('../../repositories/coupon.repository', () => ({
  findAll:    jest.fn(),
  findById:   jest.fn(),
  findByCode: jest.fn(),
  create:     jest.fn(),
  update:     jest.fn(),
  remove:     jest.fn(),
}));

const couponRepository = require('../../repositories/coupon.repository');
const { getAll, create, update, remove } = require('../../controllers/admin/coupon.controller');

beforeEach(() => jest.clearAllMocks());

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

// ── getAll() ──────────────────────────────────────────────────────────────────

describe('admin/coupon.controller — getAll()', () => {
  test('retourne la liste paginée des coupons', async () => {
    const rows = [{ id: 1, code: 'PROMO10', type: 'percent', value: 10 }];
    couponRepository.findAll.mockResolvedValue({ rows, total: 1 });

    const req = { query: { page: '1', limit: '20' } };
    const res = makeRes();
    await getAll(req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: rows,
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  test('appelle next en cas d\'erreur', async () => {
    couponRepository.findAll.mockRejectedValue(new Error('DB'));
    const req = { query: {} };
    const res = makeRes();
    const next = jest.fn();
    await getAll(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── create() ─────────────────────────────────────────────────────────────────

describe('admin/coupon.controller — create()', () => {
  test('crée le coupon et retourne 201', async () => {
    couponRepository.findByCode.mockResolvedValue(null);
    couponRepository.create.mockResolvedValue(7);
    const coupon = { id: 7, code: 'PROMO10', type: 'percent', value: 10 };
    couponRepository.findById.mockResolvedValue(coupon);

    const req = { body: { code: 'PROMO10', type: 'percent', value: 10, isActive: true } };
    const res = makeRes();
    const next = jest.fn();

    await create(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: coupon });
  });

  test('retourne 400 si code manquant', async () => {
    const req = { body: { type: 'percent', value: 10 } };
    const res = makeRes();
    const next = jest.fn();
    await create(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('retourne 400 si type invalide', async () => {
    const req = { body: { code: 'PROMO', type: 'invalid', value: 10 } };
    const res = makeRes();
    const next = jest.fn();
    await create(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('retourne 400 si value <= 0', async () => {
    const req = { body: { code: 'PROMO', type: 'fixed', value: 0 } };
    const res = makeRes();
    const next = jest.fn();
    await create(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('retourne 409 si code déjà utilisé', async () => {
    couponRepository.findByCode.mockResolvedValue({ id: 1 });
    const req = { body: { code: 'EXISTANT', type: 'fixed', value: 5 } };
    const res = makeRes();
    const next = jest.fn();
    await create(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });
});

// ── update() ─────────────────────────────────────────────────────────────────

describe('admin/coupon.controller — update()', () => {
  test('met à jour le coupon et retourne les données', async () => {
    couponRepository.findById.mockResolvedValue({ id: 1, code: 'OLD' });
    couponRepository.findByCode.mockResolvedValue(null);
    couponRepository.update.mockResolvedValue();
    const updated = { id: 1, code: 'NEWCODE', type: 'percent', value: 15 };
    couponRepository.findById.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(updated);

    const req = { params: { id: '1' }, body: { code: 'NEWCODE', type: 'percent', value: 15 } };
    const res = makeRes();
    await update(req, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, data: updated });
  });

  test('retourne 400 si code manquant', async () => {
    const req = { params: { id: '1' }, body: { type: 'percent' } };
    const res = makeRes();
    const next = jest.fn();
    await update(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('retourne 400 si type invalide', async () => {
    const req = { params: { id: '1' }, body: { code: 'CODE', type: 'bad' } };
    const res = makeRes();
    const next = jest.fn();
    await update(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('retourne 404 si coupon inexistant', async () => {
    couponRepository.findById.mockResolvedValue(null);
    const req = { params: { id: '99' }, body: { code: 'CODE', type: 'fixed' } };
    const res = makeRes();
    const next = jest.fn();
    await update(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('retourne 409 si code pris par un autre coupon', async () => {
    couponRepository.findById.mockResolvedValue({ id: 1 });
    couponRepository.findByCode.mockResolvedValue({ id: 2 }); // autre coupon
    const req = { params: { id: '1' }, body: { code: 'PRIS', type: 'fixed' } };
    const res = makeRes();
    const next = jest.fn();
    await update(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });
});

// ── remove() ─────────────────────────────────────────────────────────────────

describe('admin/coupon.controller — remove()', () => {
  test('supprime le coupon et retourne succès', async () => {
    couponRepository.remove.mockResolvedValue(true);
    const req = { params: { id: '1' } };
    const res = makeRes();
    await remove(req, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(couponRepository.remove).toHaveBeenCalledWith(1);
  });

  test('retourne 404 si coupon inexistant', async () => {
    couponRepository.remove.mockResolvedValue(false);
    const req = { params: { id: '99' } };
    const res = makeRes();
    const next = jest.fn();
    await remove(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('appelle next en cas d\'erreur', async () => {
    couponRepository.remove.mockRejectedValue(new Error('DB'));
    const req = { params: { id: '1' } };
    const res = makeRes();
    const next = jest.fn();
    await remove(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
