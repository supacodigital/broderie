/* Rôle super-administrateur — ticket ADM-08.
   « Créer un profil super-administrateur avec accès complet aux pages de
   contenu et blocs promotionnels. » Le super-administrateur a tout ce qu'a un
   administrateur (protections comprises), plus les contenus ; un administrateur
   simple n'y a plus accès. Testé de bout en bout, jetons réels. */
require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');
const { computeTotp } = require('../helpers/totp.helper');

const PASSWORD = 'SuperJest1234!';

// Crée un compte du rôle demandé et déroule la double authentification
const backOfficeToken = async (role) => {
  const email = `${role}.${Date.now()}.${Math.round(Math.random() * 1e6)}@broderie-test.ch`;
  await request(app).post('/api/v1/auth/register')
    .send({ email, password: PASSWORD, firstName: 'Jest', lastName: role });
  await pool.execute('UPDATE users SET role = ? WHERE email = ?', [role, email]);

  const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  const { mfaRequired, mfaPendingToken, accessToken } = loginRes.body.data;

  const initRes = await request(app).post('/api/v1/mfa/setup/init')
    .set('Authorization', `Bearer ${mfaPendingToken}`);
  const confirmRes = await request(app).post('/api/v1/mfa/setup/confirm')
    .set('Authorization', `Bearer ${mfaPendingToken}`)
    .send({ code: computeTotp(initRes.body.data.manualEntryKey) });

  return { mfaRequired, loginAccessToken: accessToken, token: confirmRes.body.data.accessToken };
};

let admin;
let superAdmin;

beforeAll(async () => {
  admin = await backOfficeToken('admin');
  superAdmin = await backOfficeToken('super_admin');
});

afterAll(async () => {
  // Les textes d'essai ne doivent pas rester dans la base de test
  await pool.execute("UPDATE settings SET value = '' WHERE `key` IN ('hero_title', 'hero_stats_enabled')");
});

describe('Super-administrateur — protections du back-office (ADM-08)', () => {
  test('la connexion exige la double authentification, comme pour un administrateur', () => {
    expect(superAdmin.mfaRequired).toBe('setup');
    expect(superAdmin.loginAccessToken).toBeUndefined();
    expect(superAdmin.token).toBeTruthy();
  });

  test('a accès à tout le back-office d\'un administrateur', async () => {
    for (const url of ['/api/v1/admin/orders', '/api/v1/admin/products', '/api/v1/admin/customers', '/api/v1/admin/settings/store']) {
      const res = await request(app).get(url).set('Authorization', `Bearer ${superAdmin.token}`);
      expect(res.status).toBe(200);
    }
  });
});

describe('Pages de contenu et blocs promotionnels — réservés au super-administrateur', () => {
  const CONTENT = ['/api/v1/admin/settings/legal', '/api/v1/admin/settings/about', '/api/v1/admin/settings/home', '/api/v1/admin/settings/banner'];

  test('un administrateur simple est refusé (403)', async () => {
    for (const url of CONTENT) {
      const res = await request(app).get(url).set('Authorization', `Bearer ${admin.token}`);
      expect(res.status).toBe(403);
    }
    const put = await request(app).put('/api/v1/admin/settings/legal')
      .set('Authorization', `Bearer ${admin.token}`).send({ cgv: 'x' });
    expect(put.status).toBe(403);
  });

  test('un administrateur simple garde le reste du back-office', async () => {
    const res = await request(app).get('/api/v1/admin/orders').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
  });

  test('le super-administrateur lit et modifie les contenus', async () => {
    for (const url of CONTENT) {
      const res = await request(app).get(url).set('Authorization', `Bearer ${superAdmin.token}`);
      expect(res.status).toBe(200);
    }
  });

  test('un bloc de la page d\'accueil modifié est publié sur la boutique', async () => {
    const put = await request(app).put('/api/v1/admin/settings/home')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ hero_title: 'Titre de test ADM-08', hero_stats_enabled: '0' });
    expect(put.status).toBe(200);

    const pub = await request(app).get('/api/v1/legal/home');
    expect(pub.status).toBe(200);
    expect(pub.body.data.hero_title).toBe('Titre de test ADM-08');
    expect(pub.body.data.hero_stats_enabled).toBe('0');
  });

  test('l\'interrupteur des chiffres clés n\'accepte que 0 ou 1', async () => {
    const res = await request(app).put('/api/v1/admin/settings/home')
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .send({ hero_stats_enabled: 'oui' });
    expect(res.status).toBe(400);
  });
});
