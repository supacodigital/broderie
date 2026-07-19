require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');
const { computeTotp } = require('../helpers/totp.helper');

// Crée un compte admin frais (role admin, sans MFA configurée) et retourne ses credentials
const createFreshAdmin = async () => {
  const email = `mfa.jest.${Date.now()}.${Math.random().toString(36).slice(2)}@broderie-test.ch`;
  const password = 'MfaJest1234!';

  await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password, firstName: 'Mfa', lastName: 'Jest' });

  await pool.execute(`UPDATE users SET role = 'admin' WHERE email = ?`, [email]);

  return { email, password };
};

// Dérive un compte admin jusqu'à la MFA pleinement activée (setup terminé) et
// retourne credentials + accessToken final + manualEntryKey (pour recalculer des codes)
const createAdminWithMfaEnabled = async () => {
  const { email, password } = await createFreshAdmin();

  const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password });
  const mfaPendingToken = loginRes.body.data.mfaPendingToken;

  const initRes = await request(app)
    .post('/api/v1/mfa/setup/init')
    .set('Authorization', `Bearer ${mfaPendingToken}`);
  const manualEntryKey = initRes.body.data.manualEntryKey;

  const confirmRes = await request(app)
    .post('/api/v1/mfa/setup/confirm')
    .set('Authorization', `Bearer ${mfaPendingToken}`)
    .send({ code: computeTotp(manualEntryKey) });

  return {
    email, password, manualEntryKey,
    accessToken: confirmRes.body.data.accessToken,
    recoveryCodes: confirmRes.body.data.recoveryCodes,
  };
};

// ── Flux complet setup ──────────────────────────────────────────────────────

describe('MFA — flux setup complet (premier login admin sans MFA)', () => {
  test('login admin sans MFA retourne mfaRequired "setup", jamais de tokens finaux', async () => {
    const { email, password } = await createFreshAdmin();

    const res = await request(app).post('/api/v1/auth/login').send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.data.mfaRequired).toBe('setup');
    expect(res.body.data.mfaPendingToken).toBeDefined();
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('setup/init retourne un QR code et une clé de saisie manuelle', async () => {
    const { email, password } = await createFreshAdmin();
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password });

    const res = await request(app)
      .post('/api/v1/mfa/setup/init')
      .set('Authorization', `Bearer ${loginRes.body.data.mfaPendingToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(res.body.data.manualEntryKey).toBeTruthy();
  });

  test('setup/confirm avec un code TOTP valide active la MFA et retourne tokens + recovery codes', async () => {
    const { email, password } = await createFreshAdmin();
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password });
    const mfaPendingToken = loginRes.body.data.mfaPendingToken;

    const initRes = await request(app)
      .post('/api/v1/mfa/setup/init')
      .set('Authorization', `Bearer ${mfaPendingToken}`);

    const res = await request(app)
      .post('/api/v1/mfa/setup/confirm')
      .set('Authorization', `Bearer ${mfaPendingToken}`)
      .send({ code: computeTotp(initRes.body.data.manualEntryKey) });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.recoveryCodes).toHaveLength(10);
    expect(res.headers['set-cookie']?.some((c) => c.startsWith('refreshToken'))).toBe(true);
  });

  test('setup/confirm avec un code invalide retourne 400, sans activer la MFA', async () => {
    const { email, password } = await createFreshAdmin();
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password });
    const mfaPendingToken = loginRes.body.data.mfaPendingToken;

    await request(app).post('/api/v1/mfa/setup/init').set('Authorization', `Bearer ${mfaPendingToken}`);

    const res = await request(app)
      .post('/api/v1/mfa/setup/confirm')
      .set('Authorization', `Bearer ${mfaPendingToken}`)
      .send({ code: '000000' });

    expect(res.status).toBe(400);
  });

  // ── Test anti-bypass critique n°1 : le mfaPendingToken de cette étape ne doit
  // jamais donner accès à une route protégée par requireAuth ──
  test('le mfaPendingToken émis au login ne donne PAS accès à une route admin protégée (401)', async () => {
    const { email, password } = await createFreshAdmin();
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password });

    const res = await request(app)
      .get('/api/v1/admin/dashboard/stats')
      .set('Authorization', `Bearer ${loginRes.body.data.mfaPendingToken}`);

    expect(res.status).toBe(401);
  });
});

// ── Flux login normal (MFA déjà active) ─────────────────────────────────────

describe('MFA — flux verify (login normal, MFA déjà active)', () => {
  test('login retourne mfaRequired "verify" pour un compte MFA déjà activée', async () => {
    const { email, password } = await createAdminWithMfaEnabled();

    const res = await request(app).post('/api/v1/auth/login').send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.data.mfaRequired).toBe('verify');
    expect(res.body.data.accessToken).toBeUndefined();
  });

  test('verify avec un code TOTP correct retourne les tokens finaux', async () => {
    const { email, password, manualEntryKey } = await createAdminWithMfaEnabled();
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password });

    const res = await request(app)
      .post('/api/v1/mfa/verify')
      .set('Authorization', `Bearer ${loginRes.body.data.mfaPendingToken}`)
      .send({ code: computeTotp(manualEntryKey) });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.headers['set-cookie']?.some((c) => c.startsWith('refreshToken'))).toBe(true);
  });

  test('verify avec un code incorrect retourne 401', async () => {
    const { email, password } = await createAdminWithMfaEnabled();
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password });

    const res = await request(app)
      .post('/api/v1/mfa/verify')
      .set('Authorization', `Bearer ${loginRes.body.data.mfaPendingToken}`)
      .send({ code: '000000' });

    expect(res.status).toBe(401);
  });

  // ── Test anti-bypass critique n°2, symétrique : un vrai accessToken ne doit
  // jamais être accepté par une route protégée par requireMfaPending ──
  test('un vrai accessToken (déjà authentifié) est rejeté sur /mfa/verify (401)', async () => {
    const { accessToken } = await createAdminWithMfaEnabled();

    const res = await request(app)
      .post('/api/v1/mfa/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: '123456' });

    expect(res.status).toBe(401);
  });

  test('6 tentatives consécutives avec un mauvais code verrouillent le compte, même avec un code par ailleurs correct', async () => {
    const { email, password, manualEntryKey } = await createAdminWithMfaEnabled();
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password });
    const mfaPendingToken = loginRes.body.data.mfaPendingToken;

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/mfa/verify')
        .set('Authorization', `Bearer ${mfaPendingToken}`)
        .send({ code: '000000' });
    }

    const res = await request(app)
      .post('/api/v1/mfa/verify')
      .set('Authorization', `Bearer ${mfaPendingToken}`)
      .send({ code: computeTotp(manualEntryKey) }); // code CORRECT, mais compte verrouillé

    expect(res.status).toBe(401);
  }, 15000);
});

// ── Recovery codes ────────────────────────────────────────────────────────────

describe('MFA — verify-recovery-code', () => {
  test('un recovery code valide retourne les tokens finaux', async () => {
    const { email, password, recoveryCodes } = await createAdminWithMfaEnabled();
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password });

    const res = await request(app)
      .post('/api/v1/mfa/verify-recovery-code')
      .set('Authorization', `Bearer ${loginRes.body.data.mfaPendingToken}`)
      .send({ recoveryCode: recoveryCodes[0] });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  test('rejouer le même recovery code une seconde fois retourne 401 (usage unique)', async () => {
    const { email, password, recoveryCodes } = await createAdminWithMfaEnabled();

    const login1 = await request(app).post('/api/v1/auth/login').send({ email, password });
    await request(app)
      .post('/api/v1/mfa/verify-recovery-code')
      .set('Authorization', `Bearer ${login1.body.data.mfaPendingToken}`)
      .send({ recoveryCode: recoveryCodes[0] });

    const login2 = await request(app).post('/api/v1/auth/login').send({ email, password });
    const res = await request(app)
      .post('/api/v1/mfa/verify-recovery-code')
      .set('Authorization', `Bearer ${login2.body.data.mfaPendingToken}`)
      .send({ recoveryCode: recoveryCodes[0] });

    expect(res.status).toBe(401);
  });
});
