require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');

// Dépôt d'avis produit — réservé aux acheteurs, un seul par (client, produit).

const registerAndLogin = async () => {
  const email = `review.jest.${Date.now()}.${Math.random().toString(36).slice(2)}@broderie-test.ch`;
  const password = 'ReviewJest1234!';
  await request(app).post('/api/v1/auth/register')
    .send({ email, password, firstName: 'Review', lastName: 'Jest' });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  return { token: login.body.data.accessToken, userId: login.body.data.user?.id, email };
};

const firstProductId = async () => {
  const res = await request(app).get('/api/v1/products').query({ locale: 'fr', limit: 1 });
  return res.body.data?.[0]?.id ?? null;
};

describe('Avis produit — POST /api/v1/products/:id/reviews', () => {
  test('sans token : 401', async () => {
    const pid = await firstProductId();
    if (!pid) return;
    const res = await request(app).post(`/api/v1/products/${pid}/reviews`).send({ rating: 5, body: 'Top' });
    expect(res.status).toBe(401);
  });

  test('client sans achat : 403', async () => {
    const pid = await firstProductId();
    if (!pid) return;
    const { token } = await registerAndLogin();

    const res = await request(app)
      .post(`/api/v1/products/${pid}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5, title: 'Super', body: 'Très bon produit' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('rating non entier : 400', async () => {
    const pid = await firstProductId();
    if (!pid) return;
    const { token } = await registerAndLogin();

    const res = await request(app)
      .post(`/api/v1/products/${pid}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 4.5, body: 'Bof' });

    expect(res.status).toBe(400);
  });

  // Flux complet acheteur : on insère directement une commande "paid" pour ce client
  // (le tunnel de paiement Stripe complet est couvert ailleurs).
  test('acheteur : 201 puis 409 sur un second avis', async () => {
    const pid = await firstProductId();
    if (!pid) return;
    const { token, email } = await registerAndLogin();

    const [[u]] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    const [order] = await pool.execute(
      `INSERT INTO orders (user_id, status, subtotal, shipping_cost, tax_amount, total)
       VALUES (?, 'paid', 10.00, 8.50, 0.75, 18.50)`,
      [u.id]
    );
    await pool.execute(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price, tax_rate_snapshot, product_snapshot_json)
       VALUES (?, ?, 1, 10.00, 8.10, JSON_OBJECT('name','Test'))`,
      [order.insertId, pid]
    );

    const first = await request(app)
      .post(`/api/v1/products/${pid}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5, title: 'Parfait', body: 'Rien à redire' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/v1/products/${pid}/reviews`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 3, body: 'Je change d\'avis' });
    expect(second.status).toBe(409);

    // Nettoyage
    await pool.execute('DELETE FROM reviews WHERE user_id = ?', [u.id]);
    await pool.execute('DELETE FROM order_items WHERE order_id = ?', [order.insertId]);
    await pool.execute('DELETE FROM orders WHERE id = ?', [order.insertId]);
  });
});
