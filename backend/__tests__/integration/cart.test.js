require('dotenv').config();
const request = require('supertest');
const app = require('../../app');

// — Helpers
const loginUser = async (email, password) => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return res.body.data?.accessToken;
};

const getFirstProduct = async () => {
  const res = await request(app)
    .get('/api/v1/products')
    .query({ locale: 'fr', in_stock: 'true', limit: 20 });
  // Préférer un produit avec stock >= 2 pour les tests de mise à jour de quantité
  const products = res.body.data || [];
  return products.find(p => p.stock >= 2) || products[0] || null;
};

describe('Panier — visiteur anonyme', () => {
  test('GET /cart retourne un panier vide pour un nouveau visiteur', async () => {
    const res = await request(app).get('/api/v1/cart');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toEqual([]);
  });

  test('POST /cart/items ajoute un article et retourne le panier', async () => {
    const produit = await getFirstProduct();
    if (!produit) return;

    // Récupère le cookie de session du premier GET
    const cartRes = await request(app).get('/api/v1/cart');
    const sessionCookie = cartRes.headers['set-cookie']?.find(c => c.startsWith('cartSession'));

    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Cookie', sessionCookie || '')
      .send({ productId: produit.id, quantity: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data.items[0].product_id).toBe(produit.id);
  });

  test('quantité invalide (0) retourne 400', async () => {
    const produit = await getFirstProduct();
    if (!produit) return;

    const res = await request(app)
      .post('/api/v1/cart/items')
      .send({ productId: produit.id, quantity: 0 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('quantité négative retourne 400', async () => {
    const produit = await getFirstProduct();
    if (!produit) return;

    const res = await request(app)
      .post('/api/v1/cart/items')
      .send({ productId: produit.id, quantity: -5 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('produit inexistant retourne 404', async () => {
    const res = await request(app)
      .post('/api/v1/cart/items')
      .send({ productId: 999999, quantity: 1 });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('Panier — article existant', () => {
  let sessionCookie = null;
  let itemId = null;

  beforeAll(async () => {
    const produit = await getFirstProduct();
    if (!produit) return;

    const cartRes = await request(app).get('/api/v1/cart');
    sessionCookie = cartRes.headers['set-cookie']?.find(c => c.startsWith('cartSession'));

    const addRes = await request(app)
      .post('/api/v1/cart/items')
      .set('Cookie', sessionCookie || '')
      .send({ productId: produit.id, quantity: 1 });

    itemId = addRes.body.data?.items?.[0]?.id;
  });

  test('PUT /cart/items/:id modifie la quantité', async () => {
    if (!itemId) return;

    const res = await request(app)
      .put(`/api/v1/cart/items/${itemId}`)
      .set('Cookie', sessionCookie || '')
      .send({ quantity: 2 });

    expect(res.status).toBe(200);
    const item = res.body.data.items.find(i => i.id === itemId);
    expect(item?.quantity).toBe(2);
  });

  test('DELETE /cart/items/:id supprime l\'article', async () => {
    if (!itemId) return;

    const res = await request(app)
      .delete(`/api/v1/cart/items/${itemId}`)
      .set('Cookie', sessionCookie || '');

    expect(res.status).toBe(200);
    const item = res.body.data.items.find(i => i.id === itemId);
    expect(item).toBeUndefined();
  });
});
