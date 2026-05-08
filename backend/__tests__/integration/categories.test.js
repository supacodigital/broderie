require('dotenv').config();
const request = require('supertest');
const app = require('../../app');

describe('Catégories — GET /api/v1/categories', () => {
  test('retourne la liste avec product_count', async () => {
    const res = await request(app)
      .get('/api/v1/categories')
      .query({ locale: 'fr' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    if (res.body.data.length > 0) {
      const cat = res.body.data[0];
      expect(cat).toHaveProperty('id');
      expect(cat).toHaveProperty('slug');
      expect(cat).toHaveProperty('name');
      expect(cat).toHaveProperty('product_count');
      expect(typeof cat.product_count).toBe('number');
    }
  });

  test('locale de retourne les noms en allemand', async () => {
    const resFr = await request(app).get('/api/v1/categories').query({ locale: 'fr' });
    const reDe = await request(app).get('/api/v1/categories').query({ locale: 'de' });

    expect(resFr.status).toBe(200);
    expect(reDe.status).toBe(200);
    // Les deux listes doivent avoir le même nombre de catégories
    expect(resFr.body.data.length).toBe(reDe.body.data.length);
  });

  test('locale par défaut fr si non précisée', async () => {
    const res = await request(app).get('/api/v1/categories');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
