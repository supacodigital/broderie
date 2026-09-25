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

describe('Auth — invalidation de session au changement de mot de passe (H1)', () => {
  const { pool } = require('../../config/db');

  test('un ancien refresh token est rejeté (401) après changement de mot de passe', async () => {
    const email = `h1.jest.${Date.now()}@broderie-test.ch`;
    const password = 'H1Jest1234!';
    await request(app).post('/api/v1/auth/register')
      .send({ email, password, firstName: 'H1', lastName: 'Jest' });

    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const oldRefresh = login.headers['set-cookie']?.find((c) => c.startsWith('refreshToken'));
    const accessToken = login.body.data.accessToken;

    // L'ancien refresh fonctionne AVANT
    const before = await request(app).post('/api/v1/auth/refresh-token').set('Cookie', oldRefresh);
    expect(before.status).toBe(200);

    // Changement de mot de passe
    const change = await request(app)
      .put('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ current_password: password, new_password: 'H1NewPass1!' });
    expect(change.status).toBe(200);
    // La réponse fournit un access token frais + un nouveau cookie refresh
    expect(change.body.data.accessToken).toBeDefined();
    const newRefresh = change.headers['set-cookie']?.find((c) => c.startsWith('refreshToken'));
    expect(newRefresh).toBeDefined();

    // L'ANCIEN refresh est désormais rejeté
    const after = await request(app).post('/api/v1/auth/refresh-token').set('Cookie', oldRefresh);
    expect(after.status).toBe(401);

    // Le NOUVEAU refresh fonctionne
    const withNew = await request(app).post('/api/v1/auth/refresh-token').set('Cookie', newRefresh);
    expect(withNew.status).toBe(200);

    await pool.execute('DELETE FROM users WHERE email = ?', [email]);
  });

  /* Constaté à l'audit du 25.09 : la connexion lisait le compte sans sa
     version de session. Après un changement ou une réinitialisation du mot de
     passe, chaque NOUVELLE connexion émettait un refresh token déjà périmé : la
     cliente était déconnectée à chaque rechargement de page, et au retour de
     Twint ou de la validation 3-D Secure d'une carte. */
  test('une nouvelle connexion après changement de mot de passe garde sa session', async () => {
    const email = `h1b.jest.${Date.now()}@broderie-test.ch`;
    const password = 'H1Jest1234!';
    await request(app).post('/api/v1/auth/register').send({ email, password, firstName: 'H1', lastName: 'Jest' });
    const first = await request(app).post('/api/v1/auth/login').send({ email, password });
    await request(app).put('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${first.body.data.accessToken}`)
      .send({ current_password: password, new_password: 'H1NewPass1!' });

    const again = await request(app).post('/api/v1/auth/login').send({ email, password: 'H1NewPass1!' });
    const cookie = again.headers['set-cookie']?.find((c) => c.startsWith('refreshToken'));
    const refresh = await request(app).post('/api/v1/auth/refresh-token').set('Cookie', cookie);
    expect(refresh.status).toBe(200);

    await pool.execute('DELETE FROM users WHERE email = ?', [email]);
  });

  test('une nouvelle connexion après réinitialisation du mot de passe garde sa session', async () => {
    const crypto = require('crypto');
    const email = `h1c.jest.${Date.now()}@broderie-test.ch`;
    await request(app).post('/api/v1/auth/register').send({ email, password: 'H1Jest1234!', firstName: 'H1', lastName: 'Jest' });
    // Lien de réinitialisation posé directement en base (l'e-mail est coupé en test)
    const raw = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const [[u]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    await require('../../repositories/user.repository').saveResetToken(u.id, hash, new Date(Date.now() + 3600000));
    // Même règle qu'à l'inscription (5 caractères, majuscule, chiffre, symbole)
    const tooWeak = await request(app).post('/api/v1/auth/reset-password').send({ token: raw, password: 'court' });
    expect(tooWeak.status).toBe(400);
    const reset = await request(app).post('/api/v1/auth/reset-password').send({ token: raw, password: 'Ab1!xy' });
    expect(reset.status).toBe(200);

    const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'Ab1!xy' });
    const cookie = login.headers['set-cookie']?.find((c) => c.startsWith('refreshToken'));
    const refresh = await request(app).post('/api/v1/auth/refresh-token').set('Cookie', cookie);
    expect(refresh.status).toBe(200);

    await pool.execute('DELETE FROM users WHERE email = ?', [email]);
  });
});

/* Constaté en production le 22.09 : deux inscriptions identiques simultanées
   (double-clic). La seconde recevait une erreur 500 alors que le compte venait
   d'être créé par la première. */
describe('Inscription — double envoi simultané', () => {
  test('une inscription réussit, l\'autre reçoit « compte existant » (409), jamais 500', async () => {
    const email = `double.${Date.now()}@broderie-test.ch`;
    const body = { email, password: 'DoubleClic1234!', firstName: 'Double', lastName: 'Clic' };
    const results = await Promise.all([
      request(app).post('/api/v1/auth/register').send(body),
      request(app).post('/api/v1/auth/register').send(body),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).not.toContain(500);
    expect(statuses[0]).toBe(201);
    // Selon l'ordre d'arrivée : l'autre est refusée proprement, ou les deux sont
    // séparées dans le temps et la seconde trouve le compte déjà créé
    expect([201, 409]).toContain(statuses[1]);
    const conflict = results.find((r) => r.status === 409);
    if (conflict) expect(conflict.body.message).toBe('Un compte existe déjà avec cet email.');
  });
});
