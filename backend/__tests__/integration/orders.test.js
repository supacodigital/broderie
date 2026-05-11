require('dotenv').config();
const request = require('supertest');
const app = require('../../app');

// — Helpers
const registerAndLogin = async () => {
  const email = `order.jest.${Date.now()}@broderie-test.ch`;
  const password = 'TestOrder1234!';

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password, firstName: 'Test', lastName: 'Order' });

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });

  return {
    token: loginRes.body.data.accessToken,
    cookie: loginRes.headers['set-cookie']?.find(c => c.startsWith('cartSession')),
  };
};

const addProductToCart = async (token, cartCookie) => {
  const prodRes = await request(app)
    .get('/api/v1/products')
    .query({ locale: 'fr', in_stock: 'true', limit: 1 });

  const produit = prodRes.body.data?.[0];
  if (!produit) return null;

  await request(app)
    .post('/api/v1/cart/items')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId: produit.id, quantity: 1 });

  return produit;
};

describe('Commandes — authentification requise', () => {
  test('POST /orders sans token retourne 401', async () => {
    const res = await request(app).post('/api/v1/orders');
    expect(res.status).toBe(401);
  });

  test('GET /orders sans token retourne 401', async () => {
    const res = await request(app).get('/api/v1/orders');
    expect(res.status).toBe(401);
  });
});

describe('Commandes — panier vide', () => {
  test('créer une commande avec panier vide retourne 400', async () => {
    const { token } = await registerAndLogin();

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('Commandes — flux complet', () => {
  let token = null;
  let orderId = null;

  beforeAll(async () => {
    const auth = await registerAndLogin();
    token = auth.token;
    await addProductToCart(token);
  });

  test('POST /orders crée une commande et vide le panier', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    // Facture = awaiting_payment, Twint/carte = pending
    expect(['pending', 'awaiting_payment']).toContain(res.body.data.status);
    // Frais dynamiques selon le poids — au moins CHF 8.50
    expect(parseFloat(res.body.data.shipping_cost)).toBeGreaterThanOrEqual(8.50);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThan(0);

    orderId = res.body.data.id;

    // Vérifier que le panier est bien vide après la commande
    const cartRes = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${token}`);
    expect(cartRes.body.data.items).toEqual([]);
  });

  test('GET /orders retourne la liste des commandes', async () => {
    const res = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('GET /orders/:id retourne le détail avec items et historique', async () => {
    if (!orderId) return;

    const res = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data).toHaveProperty('history');
    expect(res.body.data.history.length).toBeGreaterThan(0);
    expect(['pending', 'awaiting_payment']).toContain(res.body.data.history[0].status);
  });

  test('un utilisateur ne peut pas voir la commande d\'un autre', async () => {
    if (!orderId) return;

    const { token: autreToken } = await registerAndLogin();
    const res = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${autreToken}`);

    expect(res.status).toBe(404);
  });
});
