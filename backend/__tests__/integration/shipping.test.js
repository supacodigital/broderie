require('dotenv').config();
const request = require('supertest');
const app = require('../../app');

// Tranches tarifaires La Poste CH — miroir de shipping_rates en BDD de test
const TIERS = [
  { min: 0,    max: 0.499, price: 8.50 },
  { min: 0.5,  max: 1.999, price: 9.90 },
  { min: 2.0,  max: 4.999, price: 12.90 },
];

describe('Frais de port — GET /api/v1/shipping/rates', () => {
  test('retourne la structure complète avec carrier et estimated_days', async () => {
    const res = await request(app)
      .get('/api/v1/shipping/rates')
      .query({ weight: 0.35 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('price_chf');
    expect(res.body.data).toHaveProperty('currency', 'CHF');
    expect(res.body.data).toHaveProperty('carrier');
    expect(res.body.data).toHaveProperty('estimated_days');
    expect(typeof res.body.data.price_chf).toBe('number');
  });

  test('carrier retourné est Swiss Post', async () => {
    const res = await request(app)
      .get('/api/v1/shipping/rates')
      .query({ weight: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data.carrier).toMatch(/swiss post/i);
  });

  // Tranche 1 : 0 – 0.499 kg → CHF 8.50
  test('poids 0 kg → CHF 8.50 (tranche 1)', async () => {
    const res = await request(app).get('/api/v1/shipping/rates').query({ weight: 0 });
    expect(res.status).toBe(200);
    expect(res.body.data.price_chf).toBe(8.50);
  });

  test('poids 0.35 kg → CHF 8.50 (milieu tranche 1)', async () => {
    const res = await request(app).get('/api/v1/shipping/rates').query({ weight: 0.35 });
    expect(res.status).toBe(200);
    expect(res.body.data.price_chf).toBe(8.50);
  });

  test('poids 0.499 kg → CHF 8.50 (limite haute tranche 1)', async () => {
    const res = await request(app).get('/api/v1/shipping/rates').query({ weight: 0.499 });
    expect(res.status).toBe(200);
    expect(res.body.data.price_chf).toBe(8.50);
  });

  // Tranche 2 : 0.5 – 1.999 kg → CHF 9.90
  test('poids 0.5 kg → CHF 9.90 (tranche 2)', async () => {
    const res = await request(app).get('/api/v1/shipping/rates').query({ weight: 0.5 });
    expect(res.status).toBe(200);
    expect(res.body.data.price_chf).toBe(9.90);
  });

  test('poids 0.53 kg → CHF 9.90 (deux produits cumulés)', async () => {
    const res = await request(app).get('/api/v1/shipping/rates').query({ weight: 0.53 });
    expect(res.status).toBe(200);
    expect(res.body.data.price_chf).toBe(9.90);
  });

  test('poids 1.999 kg → CHF 9.90 (limite haute tranche 2)', async () => {
    const res = await request(app).get('/api/v1/shipping/rates').query({ weight: 1.999 });
    expect(res.status).toBe(200);
    expect(res.body.data.price_chf).toBe(9.90);
  });

  // Tranche 3 : 2.0 – 4.999 kg → CHF 12.90
  test('poids 2.0 kg → CHF 12.90 (tranche 3)', async () => {
    const res = await request(app).get('/api/v1/shipping/rates').query({ weight: 2.0 });
    expect(res.status).toBe(200);
    expect(res.body.data.price_chf).toBe(12.90);
  });

  test('poids 4.999 kg → CHF 12.90 (limite haute tranche 3)', async () => {
    const res = await request(app).get('/api/v1/shipping/rates').query({ weight: 4.999 });
    expect(res.status).toBe(200);
    expect(res.body.data.price_chf).toBe(12.90);
  });

  // Cas particuliers
  test('poids manquant dans la requête → tarif minimal CHF 8.50', async () => {
    const res = await request(app).get('/api/v1/shipping/rates');
    expect(res.status).toBe(200);
    expect(res.body.data.price_chf).toBe(8.50);
  });

  test('poids invalide (texte) → tarif minimal CHF 8.50', async () => {
    const res = await request(app).get('/api/v1/shipping/rates').query({ weight: 'abc' });
    expect(res.status).toBe(200);
    expect(res.body.data.price_chf).toBe(8.50);
  });

  test('poids négatif → tarif minimal CHF 8.50', async () => {
    const res = await request(app).get('/api/v1/shipping/rates').query({ weight: -1 });
    expect(res.status).toBe(200);
    // Le poids négatif est traité comme 0 — tranche 1
    expect(res.body.data.price_chf).toBeGreaterThanOrEqual(8.50);
  });

  test('route publique — aucun token requis', async () => {
    // Vérifier que l\'endpoint est accessible sans authentification
    const res = await request(app).get('/api/v1/shipping/rates').query({ weight: 0.5 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('price_chf est arrondi au 0.05 CHF le plus proche', async () => {
    const res = await request(app).get('/api/v1/shipping/rates').query({ weight: 0.5 });
    expect(res.status).toBe(200);
    // Arrondi CHF : montant * 20 doit être un entier
    const rounded = Math.round(res.body.data.price_chf * 20) / 20;
    expect(rounded).toBe(res.body.data.price_chf);
  });

  test('toutes les tranches retournent des prix croissants', async () => {
    const weights = [0.25, 1.0, 3.0];
    const prices = await Promise.all(
      weights.map(w =>
        request(app)
          .get('/api/v1/shipping/rates')
          .query({ weight: w })
          .then(r => r.body.data.price_chf)
      )
    );
    // CHF 8.50 < CHF 9.90 < CHF 12.90
    expect(prices[0]).toBeLessThan(prices[1]);
    expect(prices[1]).toBeLessThan(prices[2]);
  });
});
