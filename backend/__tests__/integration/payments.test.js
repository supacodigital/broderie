require('dotenv').config();
const request = require('supertest');
const app = require('../../app');

// ── Helpers ──────────────────────────────────────────────────────────────────

const registerAndLogin = async () => {
  const email    = `pay.jest.${Date.now()}@broderie-test.ch`;
  const password = 'PayJest1234!';

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password, firstName: 'Pay', lastName: 'Jest' });

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });

  return loginRes.body.data.accessToken;
};

const createOrderWithMethod = async (token, method = 'twint') => {
  // Ajoute un produit au panier
  const prodRes = await request(app)
    .get('/api/v1/products')
    .query({ locale: 'fr', in_stock: 'true', limit: 1 });

  const produit = prodRes.body.data?.[0];
  if (!produit) return null;

  await request(app)
    .post('/api/v1/cart/items')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId: produit.id, quantity: 1 });

  const orderRes = await request(app)
    .post('/api/v1/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ payment_method: method });

  return orderRes.body.data?.id ?? null;
};

// ── Méthode de paiement invalide ─────────────────────────────────────────────

describe('Paiement — Validation méthode', () => {
  let token = null;

  beforeAll(async () => {
    token = await registerAndLogin();
  });

  test('méthode invalide retourne 400', async () => {
    const prodRes = await request(app)
      .get('/api/v1/products')
      .query({ locale: 'fr', in_stock: 'true', limit: 1 });

    const produit = prodRes.body.data?.[0];
    if (!produit) return;

    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: produit.id, quantity: 1 });

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ payment_method: 'invoice' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── Paiement Stripe — création PaymentIntent ──────────────────────────────────

describe('Paiement — Stripe', () => {
  const stripeConfigured = !!process.env.STRIPE_SECRET_KEY &&
    !process.env.STRIPE_SECRET_KEY.includes('...');

  let token   = null;
  let orderId = null;

  beforeAll(async () => {
    if (!stripeConfigured) return;
    token   = await registerAndLogin();
    orderId = await createOrderWithMethod(token, 'twint');
  });

  test('POST /payments/card/:id — sans token retourne 401', async () => {
    const res = await request(app).post('/api/v1/payments/card/1');
    expect(res.status).toBe(401);
  });

  test('POST /payments/twint/:id — sans token retourne 401', async () => {
    const res = await request(app).post('/api/v1/payments/twint/1');
    expect(res.status).toBe(401);
  });

  test('POST /payments/card/:id — commande inexistante retourne 404', async () => {
    if (!stripeConfigured) return;

    const res = await request(app)
      .post('/api/v1/payments/card/999999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('POST /payments/twint/:id — crée un PaymentIntent Twint', async () => {
    if (!stripeConfigured || !orderId) return;

    const res = await request(app)
      .post(`/api/v1/payments/twint/${orderId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('qrUrl');
    expect(res.body.data).toHaveProperty('expiresAt');
    expect(res.body.data).toHaveProperty('paymentIntentId');
    // qrUrl peut être null en mode test Stripe (non disponible sans vrai compte Twint)
    if (res.body.data.qrUrl !== null) {
      expect(res.body.data.qrUrl).toMatch(/^https?:\/\//);
    }
  });

  test('POST /payments/card/:id — crée un PaymentIntent carte', async () => {
    if (!stripeConfigured) return;

    const cardToken   = await registerAndLogin();
    const cardOrderId = await createOrderWithMethod(cardToken, 'card');
    if (!cardOrderId) return;

    const res = await request(app)
      .post(`/api/v1/payments/card/${cardOrderId}`)
      .set('Authorization', `Bearer ${cardToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('clientSecret');
    expect(res.body.data.clientSecret).toMatch(/^pi_.*_secret_/);
  });
});

// ── Webhook Stripe ────────────────────────────────────────────────────────────

describe('Paiement — Webhook Stripe', () => {
  test('POST /payments/webhook sans signature retourne 400', async () => {
    const res = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'payment_intent.succeeded' }));

    // Sans signature valide, Stripe reject → 400 (pas 500)
    expect(res.status).toBe(400);
  });
});
