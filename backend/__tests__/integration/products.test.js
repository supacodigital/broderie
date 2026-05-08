require('dotenv').config();
const request = require('supertest');
const app = require('../../app');

describe('Produits — GET /api/v1/products', () => {
  test('retourne une liste paginée', async () => {
    const res = await request(app)
      .get('/api/v1/products')
      .query({ locale: 'fr', page: 1, limit: 5 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 5,
    });
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(0);
  });

  test('chaque produit contient les champs requis pour le frontend', async () => {
    const res = await request(app)
      .get('/api/v1/products')
      .query({ locale: 'fr', limit: 1 });

    if (res.body.data.length === 0) return;

    const produit = res.body.data[0];
    expect(produit).toHaveProperty('id');
    expect(produit).toHaveProperty('slug');
    expect(produit).toHaveProperty('price_chf');
    expect(produit).toHaveProperty('name');
    expect(produit).toHaveProperty('stock');
    expect(produit).toHaveProperty('avg_rating');
    expect(produit).toHaveProperty('review_count');
  });

  test('filtre ?featured=true ne retourne que les produits mis en avant', async () => {
    const res = await request(app)
      .get('/api/v1/products')
      .query({ locale: 'fr', featured: 'true' });

    expect(res.status).toBe(200);
    res.body.data.forEach(p => expect(p.is_featured).toBe(1));
  });

  test('filtre ?in_stock=true ne retourne que les produits en stock', async () => {
    const res = await request(app)
      .get('/api/v1/products')
      .query({ locale: 'fr', in_stock: 'true' });

    expect(res.status).toBe(200);
    res.body.data.forEach(p => expect(p.stock).toBeGreaterThan(0));
  });

  test('limite max à 100 même si on demande plus', async () => {
    const res = await request(app)
      .get('/api/v1/products')
      .query({ locale: 'fr', limit: 999 });

    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBeLessThanOrEqual(100);
  });

  test('tri par prix ascendant', async () => {
    const res = await request(app)
      .get('/api/v1/products')
      .query({ locale: 'fr', sort: 'price_chf', order: 'asc', limit: 5 });

    expect(res.status).toBe(200);
    const prices = res.body.data.map(p => parseFloat(p.price_chf));
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }
  });
});

describe('Produits — GET /api/v1/products/:id', () => {
  test('retourne un produit avec images et variantes', async () => {
    // Récupère d'abord un id valide
    const list = await request(app).get('/api/v1/products').query({ locale: 'fr', limit: 1 });
    if (!list.body.data.length) return;

    const id = list.body.data[0].id;
    const res = await request(app).get(`/api/v1/products/${id}`).query({ locale: 'fr' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('images');
    expect(res.body.data).toHaveProperty('variants');
    expect(Array.isArray(res.body.data.images)).toBe(true);
  });

  test('id inexistant retourne 404', async () => {
    const res = await request(app).get('/api/v1/products/999999').query({ locale: 'fr' });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('Produits — GET /api/v1/products/search', () => {
  test('recherche retourne une liste paginée', async () => {
    const res = await request(app)
      .get('/api/v1/products/search')
      .query({ q: 'kit', locale: 'fr' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
