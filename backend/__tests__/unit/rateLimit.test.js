// Tests unitaires — limiteurs de débit de l'API
//
// Non-régression : la limite globale était de 1000 requêtes / 15 min, toutes
// méthodes confondues. Or une page de catalogue déclenche une dizaine d'appels
// (bandeau, catégories, marques, produits, panier, favoris, compte) : une
// cliente qui parcourait la boutique une demi-heure la saturait, et TOUTES les
// routes tombaient ensemble — la boutique devenait inutilisable.

const express = require('express');
const request = require('supertest');
const rateLimit = require('express-rate-limit');

/* Reconstruit la configuration de app.js avec des plafonds volontairement bas,
   pour atteindre la limite en quelques requêtes plutôt qu'en milliers. */
function makeApp({ readMax, writeMax }) {
  const app = express();
  app.set('trust proxy', 1);

  /* Le rafraîchissement de token est automatique : le limiter déconnecterait une
     cliente qui n'a rien fait d'anormal. L'exclusion vaut pour les deux limiteurs,
     car c'est un POST — il tomberait sinon dans le quota d'écriture. */
  const skipLimiter = (req) => req.path === '/v1/auth/refresh-token';

  const readLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: readMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipLimiter,
  });

  const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: writeMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipLimiter,
  });

  app.use('/api/', (req, res, next) => (
    req.method === 'GET' || req.method === 'HEAD'
      ? readLimiter(req, res, next)
      : writeLimiter(req, res, next)
  ));
  app.all('/api/*splat', (req, res) => res.json({ success: true }));
  return app;
}

describe('limiteurs de débit — lecture et écriture séparées', () => {
  test('la lecture reste permise après saturation de l’écriture', async () => {
    const app = makeApp({ readMax: 100, writeMax: 2 });

    // On sature le quota d'écriture
    await request(app).post('/api/v1/orders');
    await request(app).post('/api/v1/orders');
    const ecritureRefusee = await request(app).post('/api/v1/orders');
    expect(ecritureRefusee.status).toBe(429);

    // La navigation doit continuer de fonctionner : c'est tout l'intérêt
    // d'avoir séparé les deux compteurs.
    const lecture = await request(app).get('/api/v1/products');
    expect(lecture.status).toBe(200);
  });

  test('l’écriture est bloquée au-delà de son plafond', async () => {
    const app = makeApp({ readMax: 100, writeMax: 3 });

    const codes = [];
    for (let i = 0; i < 5; i += 1) {
      codes.push((await request(app).post('/api/v1/reviews')).status);
    }
    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });

  test('la lecture est bloquée au-delà de son propre plafond', async () => {
    const app = makeApp({ readMax: 2, writeMax: 100 });

    await request(app).get('/api/v1/products');
    await request(app).get('/api/v1/products');
    const refusee = await request(app).get('/api/v1/products');
    expect(refusee.status).toBe(429);
  });

  /* Le rafraîchissement de token est déclenché par le navigateur, pas par la
     cliente : le bloquer revient à déconnecter quelqu'un au milieu de sa visite. */
  test('le rafraîchissement de token échappe AUSSI au limiteur d’écriture', async () => {
    // C'est un POST : sans exclusion explicite, il partagerait le quota des
    // commandes et des avis.
    const app = makeApp({ readMax: 100, writeMax: 1 });

    await request(app).post('/api/v1/orders');
    expect((await request(app).post('/api/v1/orders')).status).toBe(429);

    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post('/api/v1/auth/refresh-token');
      expect(res.status).toBe(200);
    }
  });

  test('le rafraîchissement de token échappe au limiteur de lecture', async () => {
    const app = makeApp({ readMax: 1, writeMax: 100 });

    // Le quota de lecture est épuisé dès la première requête
    await request(app).get('/api/v1/products');
    expect((await request(app).get('/api/v1/products')).status).toBe(429);

    // Le refresh doit malgré tout passer, autant de fois que nécessaire
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).get('/api/v1/auth/refresh-token');
      expect(res.status).toBe(200);
    }
  });
});
