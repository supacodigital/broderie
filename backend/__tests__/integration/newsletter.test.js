require('dotenv').config();
const request = require('supertest');
const app = require('../../app');

const TEST_EMAIL = `newsletter.jest.${Date.now()}@broderie-test.ch`;

describe('Newsletter — POST /api/v1/newsletter/subscribe', () => {
  test('inscription réussie retourne 201', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/subscribe')
      .send({ email: TEST_EMAIL, locale: 'fr' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('double inscription retourne 200 avec message "déjà inscrit"', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/subscribe')
      .send({ email: TEST_EMAIL, locale: 'fr' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/déjà/i);
  });

  test('email invalide retourne 400', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/subscribe')
      .send({ email: 'pasunemail', locale: 'fr' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('email manquant retourne 400', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/subscribe')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('Newsletter — POST /api/v1/newsletter/unsubscribe', () => {
  test('désabonnement réussi retourne 200', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/unsubscribe')
      .send({ email: TEST_EMAIL });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('email inexistant retourne 404', async () => {
    const res = await request(app)
      .post('/api/v1/newsletter/unsubscribe')
      .send({ email: 'inexistant@test.ch' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
