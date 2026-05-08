require('dotenv').config();
const request = require('supertest');
const app     = require('../../app');
const { pool } = require('../../config/db');

// Coupon de test créé avant la suite, supprimé après
let testCouponId;

beforeAll(async () => {
  const [result] = await pool.execute(
    `INSERT INTO coupons (code, type, value, min_order_chf, usage_limit, used_count, expires_at, is_active)
     VALUES (?, 'percent', 10, 30, 5, 0, DATE_ADD(NOW(), INTERVAL 30 DAY), 1)`,
    [`JEST_TEST_${Date.now()}`]
  );
  testCouponId = result.insertId;
  // On récupère le code généré
  const [rows] = await pool.execute(`SELECT code FROM coupons WHERE id = ?`, [testCouponId]);
  global.testCouponCode = rows[0].code;
});

afterAll(async () => {
  if (testCouponId) {
    await pool.execute(`DELETE FROM coupons WHERE id = ?`, [testCouponId]);
  }
  await pool.end().catch(() => {});
});

describe('POST /api/v1/coupons/validate', () => {

  describe('erreurs de validation', () => {
    test('retourne 400 si aucun code fourni', async () => {
      const res = await request(app)
        .post('/api/v1/coupons/validate')
        .send({ subtotal: 50 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/code requis/i);
    });

    test('retourne 400 si le code est inconnu', async () => {
      const res = await request(app)
        .post('/api/v1/coupons/validate')
        .send({ code: 'CODE_INEXISTANT_XYZ', subtotal: 50 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('retourne 400 si le sous-total est inférieur au minimum', async () => {
      const res = await request(app)
        .post('/api/v1/coupons/validate')
        .send({ code: global.testCouponCode, subtotal: 20 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/CHF 30.00/);
    });
  });

  describe('cas valides', () => {
    test('retourne 200 avec code, type, value et discount pour un coupon valide', async () => {
      const res = await request(app)
        .post('/api/v1/coupons/validate')
        .send({ code: global.testCouponCode, subtotal: 50 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        code:     global.testCouponCode,
        type:     'percent',
        value:    10,
        discount: 5,
      });
    });

    test('le code est insensible à la casse', async () => {
      const lower = global.testCouponCode.toLowerCase();
      const res = await request(app)
        .post('/api/v1/coupons/validate')
        .send({ code: lower, subtotal: 50 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('discount est arrondi au 0.05 CHF', async () => {
      const res = await request(app)
        .post('/api/v1/coupons/validate')
        .send({ code: global.testCouponCode, subtotal: 49.90 });

      expect(res.status).toBe(200);
      const discount = res.body.data.discount;
      // Doit être un multiple de 0.05
      expect(Math.round(discount * 100) % 5).toBe(0);
    });
  });

  describe('coupon expiré', () => {
    let expiredCouponId;
    let expiredCouponCode;

    beforeAll(async () => {
      const [result] = await pool.execute(
        `INSERT INTO coupons (code, type, value, min_order_chf, usage_limit, used_count, expires_at, is_active)
         VALUES (?, 'fixed', 10, 0, null, 0, DATE_SUB(NOW(), INTERVAL 1 DAY), 1)`,
        [`JEST_EXPIRED_${Date.now()}`]
      );
      expiredCouponId = result.insertId;
      const [rows] = await pool.execute(`SELECT code FROM coupons WHERE id = ?`, [expiredCouponId]);
      expiredCouponCode = rows[0].code;
    });

    afterAll(async () => {
      if (expiredCouponId) {
        await pool.execute(`DELETE FROM coupons WHERE id = ?`, [expiredCouponId]);
      }
    });

    test('retourne 400 pour un coupon expiré', async () => {
      const res = await request(app)
        .post('/api/v1/coupons/validate')
        .send({ code: expiredCouponCode, subtotal: 50 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/expir/i);
    });
  });

  describe('coupon à limite d\'utilisation atteinte', () => {
    let fullCouponId;
    let fullCouponCode;

    beforeAll(async () => {
      const [result] = await pool.execute(
        `INSERT INTO coupons (code, type, value, min_order_chf, usage_limit, used_count, expires_at, is_active)
         VALUES (?, 'fixed', 5, 0, 2, 2, null, 1)`,
        [`JEST_FULL_${Date.now()}`]
      );
      fullCouponId = result.insertId;
      const [rows] = await pool.execute(`SELECT code FROM coupons WHERE id = ?`, [fullCouponId]);
      fullCouponCode = rows[0].code;
    });

    afterAll(async () => {
      if (fullCouponId) {
        await pool.execute(`DELETE FROM coupons WHERE id = ?`, [fullCouponId]);
      }
    });

    test('retourne 400 si la limite d\'utilisation est atteinte', async () => {
      const res = await request(app)
        .post('/api/v1/coupons/validate')
        .send({ code: fullCouponCode, subtotal: 50 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/limite/i);
    });
  });
});
