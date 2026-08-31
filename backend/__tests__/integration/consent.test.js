require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');

// Journalisation du consentement cookies (LPD) — la route fait un INSERT direct,
// on vérifie donc le contenu réellement écrit en base.

const readLast = async (sessionId) => {
  const [rows] = await pool.execute(
    `SELECT user_id, session_id, type, accepted, version, ip_hash
       FROM consent_logs
      WHERE session_id = ?
      ORDER BY id DESC LIMIT 1`,
    [sessionId]
  );
  return rows[0] ?? null;
};

describe('Consentement cookies — POST /api/v1/consent', () => {
  test('accepté : enregistre accepted=1, sans user ni session', async () => {
    const res = await request(app)
      .post('/api/v1/consent')
      .send({ type: 'cookies', accepted: true, version: '1.0' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Anonyme sans panier → user_id et session_id NULL, l'INSERT ne doit plus échouer
    const [rows] = await pool.execute(
      `SELECT accepted, ip_hash FROM consent_logs
        WHERE user_id IS NULL AND session_id IS NULL
        ORDER BY id DESC LIMIT 1`
    );
    expect(rows[0]).toBeDefined();
    expect(rows[0].accepted).toBe(1);
    expect(rows[0].ip_hash).toMatch(/^[0-9a-f]{64}$/); // SHA-256, jamais l'IP en clair
  });

  test('refusé : enregistre accepted=0', async () => {
    const sessionId = `jest-consent-${Date.now()}`;

    const res = await request(app)
      .post('/api/v1/consent')
      .set('Cookie', [`cartSession=${sessionId}`])
      .send({ type: 'cookies', accepted: false, version: '1.0' });

    expect(res.status).toBe(200);

    const row = await readLast(sessionId);
    expect(row).toBeDefined();
    expect(row.accepted).toBe(0);
    expect(row.session_id).toBe(sessionId); // le vrai cookie panier est bien lu
  });

  test('champ accepted manquant : 400', async () => {
    const res = await request(app)
      .post('/api/v1/consent')
      .send({ type: 'cookies', version: '1.0' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('utilisateur connecté : user_id renseigné', async () => {
    const email = `consent.jest.${Date.now()}@broderie-test.ch`;
    const password = 'ConsentJest1234!';
    await request(app).post('/api/v1/auth/register')
      .send({ email, password, firstName: 'Consent', lastName: 'Jest' });
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const token = login.body.data.accessToken;

    const sessionId = `jest-consent-auth-${Date.now()}`;
    const res = await request(app)
      .post('/api/v1/consent')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', [`cartSession=${sessionId}`])
      .send({ type: 'cookies', accepted: true, version: '1.0' });

    expect(res.status).toBe(200);
    const row = await readLast(sessionId);
    expect(row.user_id).not.toBeNull();
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM consent_logs WHERE session_id LIKE 'jest-consent%'`);
  });
});
