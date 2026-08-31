const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');

// Crée un compte client jetable, marque son email comme vérifié (les routes
// commande / avis l'exigent depuis H11) et retourne son access token + cookie panier.
const registerVerifiedUser = async (prefix = 'jest') => {
  const email = `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2)}@broderie-test.ch`;
  const password = 'JestVerified1234!';

  await request(app).post('/api/v1/auth/register')
    .send({ email, password, firstName: 'Jest', lastName: 'Verified' });

  await pool.execute('UPDATE users SET email_verified_at = NOW() WHERE email = ?', [email]);

  const login = await request(app).post('/api/v1/auth/login').send({ email, password });

  return {
    email,
    password,
    token: login.body.data.accessToken,
    userId: login.body.data.user?.id ?? null,
    cartCookie: login.headers['set-cookie']?.find((c) => c.startsWith('cartSession')),
    refreshCookie: login.headers['set-cookie']?.find((c) => c.startsWith('refreshToken')),
  };
};

module.exports = { registerVerifiedUser };
