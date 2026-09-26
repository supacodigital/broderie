/* Aperçu en direct du contenu (26.09) : l'administration affiche la boutique
   dans un cadre. Seul notre propre domaine peut le faire — un autre site qui
   l'intègrerait pour détourner les clics reste bloqué. */
require('dotenv').config();
const request = require('supertest');
const app = require('../../app');
const { pool } = require('../../config/db');

afterAll(() => pool.end());

describe('En-têtes de sécurité — affichage dans un cadre', () => {
  test('CSP : frame-ancestors limité au même domaine', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-security-policy']).toMatch(/frame-ancestors 'self'(;|$)/);
    expect(res.headers['content-security-policy']).not.toMatch(/frame-ancestors[^;]*'none'/);
  });

  test('X-Frame-Options : SAMEORIGIN, pour les navigateurs sans CSP', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });
});
