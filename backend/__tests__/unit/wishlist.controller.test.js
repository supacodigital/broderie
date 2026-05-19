// Tests unitaires wishlist.controller

jest.mock('../../repositories/wishlist.repository', () => ({
  findByUser: jest.fn(),
  add:        jest.fn(),
  remove:     jest.fn(),
}));

jest.mock('../../repositories/product.repository', () => ({
  findById: jest.fn(),
}));

jest.mock('../../utils/locale.utils', () => ({
  normalizeLocale: jest.fn((l) => l ?? 'fr'),
}));

const wishlistRepository = require('../../repositories/wishlist.repository');
const productRepository  = require('../../repositories/product.repository');
const { getWishlist, addToWishlist, removeFromWishlist } = require('../../controllers/wishlist.controller');

beforeEach(() => jest.clearAllMocks());

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

// ── getWishlist() ─────────────────────────────────────────────────────────────

describe('wishlist.controller — getWishlist()', () => {
  test('retourne les articles de la wishlist', async () => {
    const items = [{ product_id: 1, name: 'Fil DMC' }];
    wishlistRepository.findByUser.mockResolvedValue(items);

    const req = { user: { id: 1, locale: 'fr' }, query: {} };
    const res = makeRes();
    const next = jest.fn();

    await getWishlist(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: items });
    expect(wishlistRepository.findByUser).toHaveBeenCalledWith(1, expect.any(String));
  });

  test('appelle next en cas d\'erreur', async () => {
    wishlistRepository.findByUser.mockRejectedValue(new Error('DB'));
    const req = { user: { id: 1 }, query: {} };
    const res = makeRes();
    const next = jest.fn();
    await getWishlist(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── addToWishlist() ───────────────────────────────────────────────────────────

describe('wishlist.controller — addToWishlist()', () => {
  test('ajoute le produit et retourne 201', async () => {
    productRepository.findById.mockResolvedValue({ id: 5, name: 'Fil' });
    wishlistRepository.add.mockResolvedValue(true);

    const req = { params: { productId: '5' }, user: { id: 1 }, query: {} };
    const res = makeRes();
    const next = jest.fn();

    await addToWishlist(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(wishlistRepository.add).toHaveBeenCalledWith(1, 5);
  });

  test('retourne 404 si produit introuvable', async () => {
    productRepository.findById.mockResolvedValue(null);

    const req = { params: { productId: '99' }, user: { id: 1 }, query: {} };
    const res = makeRes();
    const next = jest.fn();

    await addToWishlist(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    expect(wishlistRepository.add).not.toHaveBeenCalled();
  });

  test('appelle next en cas d\'erreur', async () => {
    productRepository.findById.mockRejectedValue(new Error('DB'));
    const req = { params: { productId: '5' }, user: { id: 1 }, query: {} };
    const res = makeRes();
    const next = jest.fn();
    await addToWishlist(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── removeFromWishlist() ──────────────────────────────────────────────────────

describe('wishlist.controller — removeFromWishlist()', () => {
  test('supprime le produit et retourne succès', async () => {
    wishlistRepository.remove.mockResolvedValue(true);

    const req = { params: { productId: '5' }, user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();

    await removeFromWishlist(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(wishlistRepository.remove).toHaveBeenCalledWith(1, 5);
  });

  test('retourne 404 si produit absent de la wishlist', async () => {
    wishlistRepository.remove.mockResolvedValue(false);

    const req = { params: { productId: '99' }, user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();

    await removeFromWishlist(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  test('appelle next en cas d\'erreur', async () => {
    wishlistRepository.remove.mockRejectedValue(new Error('DB'));
    const req = { params: { productId: '5' }, user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();
    await removeFromWishlist(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
