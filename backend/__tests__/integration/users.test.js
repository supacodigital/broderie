require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');

// Droits LPD : export des données personnelles + suppression (anonymisation) de compte.

const makeAccount = async () => {
  const email = `lpd.jest.${Date.now()}.${Math.random().toString(36).slice(2)}@broderie-test.ch`;
  const password = 'LpdJest1234!';
  await request(app).post('/api/v1/auth/register')
    .send({ email, password, firstName: 'Lpd', lastName: 'Jest' });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  return {
    email, password,
    token: login.body.data.accessToken,
    refreshCookie: login.headers['set-cookie']?.find((c) => c.startsWith('refreshToken')),
  };
};

describe('GET /api/v1/users/me/export', () => {
  test('sans token : 401', async () => {
    const res = await request(app).get('/api/v1/users/me/export');
    expect(res.status).toBe(401);
  });

  test('avec token : fichier PDF complet en pièce jointe', async () => {
    const { token } = await makeAccount();
    const res = await request(app)
      .get('/api/v1/users/me/export')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.headers['content-disposition']).toMatch(/\.pdf"/);

    const pdfBuffer = res.body;
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.slice(0, 5).toString()).toBe('%PDF-');
    expect(pdfBuffer.length).toBeGreaterThan(500);
  });
});

describe('DELETE /api/v1/users/me', () => {
  test('sans token : 401', async () => {
    const res = await request(app).delete('/api/v1/users/me').send({ password: 'x' });
    expect(res.status).toBe(401);
  });

  test('mauvais mot de passe : 401', async () => {
    const { token } = await makeAccount();
    const res = await request(app)
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'faux' });
    expect(res.status).toBe(401);
  });

  test('sans mot de passe : 400', async () => {
    const { token } = await makeAccount();
    const res = await request(app)
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('bon mot de passe : 200, cookie refresh effacé, compte anonymisé et re-login impossible', async () => {
    const { token, email, password } = await makeAccount();

    const [[before]] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);

    const res = await request(app)
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const cleared = res.headers['set-cookie']?.find((c) => c.startsWith('refreshToken='));
    expect(cleared).toMatch(/refreshToken=;/);

    // Le compte existe toujours (obligation comptable) mais anonymisé
    const [[after]] = await pool.execute('SELECT email, deleted_at, first_name FROM users WHERE id = ?', [before.id]);
    expect(after.deleted_at).not.toBeNull();
    expect(after.email).toMatch(/^deleted\+\d+\+\d+@anonymized\.local$/);
    expect(after.first_name).toBe('Supprimé');

    // Auth fermée
    const relogin = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(relogin.status).toBe(401);

    const forgot = await request(app).post('/api/v1/auth/forgot-password').send({ email });
    expect(forgot.status).toBe(200); // réponse générique, aucun mail

    const me = await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(404);

    // Ré-inscription possible avec la même adresse réelle
    const reregister = await request(app).post('/api/v1/auth/register')
      .send({ email, password: 'Autre1234!', firstName: 'Re', lastName: 'New' });
    expect(reregister.status).toBe(201);

    // Nettoyage : les 2 comptes (anonymisé + ré-inscrit)
    await pool.execute('DELETE FROM users WHERE id = ? OR email = ?', [before.id, email]);
  });
});
