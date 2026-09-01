// Tests unitaires review.controller

jest.mock('../../repositories/review.repository', () => ({
  findApprovedByProduct: jest.fn(),
  findApproved:          jest.fn(),
  hasPurchased:          jest.fn(),
  create:                jest.fn(),
}));

const reviewRepository = require('../../repositories/review.repository');
const { getByProduct, getApproved, create } = require('../../controllers/review.controller');

beforeEach(() => jest.clearAllMocks());

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

// ── getByProduct() ────────────────────────────────────────────────────────────

describe('review.controller — getByProduct()', () => {
  test('retourne les avis paginés d\'un produit', async () => {
    const rows = [{ id: 1, rating: 5 }];
    reviewRepository.findApprovedByProduct.mockResolvedValue({ rows, total: 1 });

    const req = { params: { id: '10' }, query: { page: '1', limit: '20' } };
    const res = makeRes();
    const next = jest.fn();

    await getByProduct(req, res, next);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: rows,
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    expect(reviewRepository.findApprovedByProduct).toHaveBeenCalledWith(10, { page: 1, limit: 20 });
  });

  test('applique les valeurs par défaut si query absent', async () => {
    reviewRepository.findApprovedByProduct.mockResolvedValue({ rows: [], total: 0 });
    const req = { params: { id: '5' }, query: {} };
    const res = makeRes();
    await getByProduct(req, res, jest.fn());
    expect(reviewRepository.findApprovedByProduct).toHaveBeenCalledWith(5, { page: 1, limit: 20 });
  });

  test('applique la limite max de 50', async () => {
    reviewRepository.findApprovedByProduct.mockResolvedValue({ rows: [], total: 0 });
    const req = { params: { id: '5' }, query: { limit: '999' } };
    const res = makeRes();
    await getByProduct(req, res, jest.fn());
    expect(reviewRepository.findApprovedByProduct).toHaveBeenCalledWith(5, { page: 1, limit: 50 });
  });

  test('appelle next en cas d\'erreur', async () => {
    reviewRepository.findApprovedByProduct.mockRejectedValue(new Error('DB'));
    const req = { params: { id: '5' }, query: {} };
    const res = makeRes();
    const next = jest.fn();
    await getByProduct(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── create() ──────────────────────────────────────────────────────────────────

describe('review.controller — create()', () => {
  test('crée un avis et retourne 201 (acheteur du produit)', async () => {
    reviewRepository.hasPurchased.mockResolvedValue(true);
    reviewRepository.create.mockResolvedValue();
    const req = {
      params: { id: '10' },
      body: { rating: 4, title: 'Super', body: 'Très bien' },
      user: { id: 3 },
    };
    const res = makeRes();
    const next = jest.fn();

    await create(req, res, next);
    expect(reviewRepository.hasPurchased).toHaveBeenCalledWith(3, 10);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(reviewRepository.create).toHaveBeenCalledWith({
      userId: 3, productId: 10, rating: 4, title: 'Super', body: 'Très bien',
    });
  });

  test('retourne 403 si l\'utilisateur n\'a pas acheté le produit', async () => {
    reviewRepository.hasPurchased.mockResolvedValue(false);
    const req = { params: { id: '10' }, body: { rating: 5 }, user: { id: 7 } };
    const res = makeRes();
    const next = jest.fn();
    await create(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(reviewRepository.create).not.toHaveBeenCalled();
  });

  test('retourne 400 si rating absent', async () => {
    const req = { params: { id: '10' }, body: {}, user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();
    await create(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(reviewRepository.hasPurchased).not.toHaveBeenCalled();
  });

  test('retourne 400 si rating < 1', async () => {
    const req = { params: { id: '10' }, body: { rating: 0 }, user: { id: 1 } };
    const res = makeRes();
    await create(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retourne 400 si rating > 5', async () => {
    const req = { params: { id: '10' }, body: { rating: 6 }, user: { id: 1 } };
    const res = makeRes();
    await create(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retourne 400 si rating non entier', async () => {
    const req = { params: { id: '10' }, body: { rating: 4.5 }, user: { id: 1 } };
    const res = makeRes();
    await create(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('retourne 400 si body dépasse 1000 caractères', async () => {
    const req = { params: { id: '10' }, body: { rating: 5, body: 'x'.repeat(1001) }, user: { id: 1 } };
    const res = makeRes();
    await create(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('convertit un doublon (ER_DUP_ENTRY) en 409', async () => {
    reviewRepository.hasPurchased.mockResolvedValue(true);
    const dup = new Error('dup');
    dup.code = 'ER_DUP_ENTRY';
    dup.sqlMessage = "Duplicate entry '3-10' for key 'uq_reviews_user_product'";
    reviewRepository.create.mockRejectedValue(dup);
    const req = { params: { id: '10' }, body: { rating: 3 }, user: { id: 3 } };
    const res = makeRes();
    const next = jest.fn();
    await create(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });

  test('appelle next en cas d\'erreur générique', async () => {
    reviewRepository.hasPurchased.mockResolvedValue(true);
    reviewRepository.create.mockRejectedValue(new Error('DB'));
    const req = { params: { id: '10' }, body: { rating: 3 }, user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();
    await create(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── getApproved() ─────────────────────────────────────────────────────────────

describe('review.controller — getApproved()', () => {
  test('retourne les avis approuvés récents', async () => {
    const rows = [{ id: 1, rating: 5 }, { id: 2, rating: 4 }];
    reviewRepository.findApproved.mockResolvedValue(rows);

    const req = { query: { limit: '2' } };
    const res = makeRes();
    const next = jest.fn();

    await getApproved(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: rows });
    expect(reviewRepository.findApproved).toHaveBeenCalledWith({ limit: 2, rating: null });
  });

  test('passe le filtre rating si fourni', async () => {
    reviewRepository.findApproved.mockResolvedValue([]);
    const req = { query: { rating: '5' } };
    const res = makeRes();
    await getApproved(req, res, jest.fn());
    expect(reviewRepository.findApproved).toHaveBeenCalledWith({ limit: 3, rating: 5 });
  });

  test('applique la limite max de 10', async () => {
    reviewRepository.findApproved.mockResolvedValue([]);
    const req = { query: { limit: '999' } };
    const res = makeRes();
    await getApproved(req, res, jest.fn());
    expect(reviewRepository.findApproved).toHaveBeenCalledWith({ limit: 10, rating: null });
  });

  test('appelle next en cas d\'erreur', async () => {
    reviewRepository.findApproved.mockRejectedValue(new Error('DB'));
    const req = { query: {} };
    const res = makeRes();
    const next = jest.fn();
    await getApproved(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
