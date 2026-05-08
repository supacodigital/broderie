require('dotenv').config();
const request = require('supertest');
const app = require('../../app');

// — Données de test uniques pour éviter les conflits entre runs
const TEST_EMAIL = `test.jest.${Date.now()}@broderie-test.ch`;
const TEST_PASSWORD = 'TestJest1234!';

let accessToken = null;
let refreshCookie = null;

describe('Auth — POST /api/v1/auth/register', () => {
  test('inscription réussie retourne 201 + success:true', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, firstName: 'Test', lastName: 'Jest' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe(TEST_EMAIL);
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  test('email déjà utilisé retourne 409', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, firstName: 'Test', lastName: 'Jest' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  test('champs manquants retourne 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'incomplet@test.ch' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('Auth — POST /api/v1/auth/login', () => {
  test('connexion réussie retourne access token + cookie refresh', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();

    // Sauvegarder pour les tests suivants
    accessToken = res.body.data.accessToken;
    refreshCookie = res.headers['set-cookie']?.find(c => c.startsWith('refreshToken'));
    expect(refreshCookie).toBeDefined();
  });

  test('mauvais mot de passe retourne 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: 'MauvaisMotDePasse!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    // Le message est générique — ne révèle pas lequel des deux champs est incorrect
    expect(res.body.message).toMatch(/incorrect/i);
  });

  test('email inexistant retourne 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'inexistant@test.ch', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('Auth — POST /api/v1/auth/refresh-token', () => {
  test('renouvelle le token avec un cookie valide', async () => {
    if (!refreshCookie) return;

    const res = await request(app)
      .post('/api/v1/auth/refresh-token')
      .set('Cookie', refreshCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  test('sans cookie retourne 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh-token');

    expect(res.status).toBe(401);
  });
});

describe('Auth — POST /api/v1/auth/logout', () => {
  test('déconnexion efface le cookie', async () => {
    if (!accessToken) return;

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
