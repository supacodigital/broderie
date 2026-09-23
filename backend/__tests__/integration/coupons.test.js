require('dotenv').config();
const request = require('supertest');
const app     = require('../../app');
const { pool } = require('../../config/db');
const { registerVerifiedUser } = require('../helpers/auth.helper');

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

/* Non-régression ADM-03 (module promotions / coupons) — un bon de fidélité était
   refusé au checkout : la vérification ne connaissait que les coupons, alors que
   la création de commande acceptait les bons. La cliente ne pouvait jamais
   utiliser le bon reçu en atteignant un palier. */
describe('POST /api/v1/coupons/validate — bons de fidélité', () => {
  let owner;
  let tierId;
  let rewardCode;
  let usedRewardCode;

  beforeAll(async () => {
    owner = await registerVerifiedUser('reward.owner');
    const [tier] = await pool.execute(
      `INSERT INTO loyalty_tiers (name, min_spend_chf, reward_type, reward_value, reward_validity_days, is_active, sort_order)
       VALUES ('Jest Argent', 200, 'fixed', 20, 90, 0, 99)`
    );
    tierId = tier.insertId;
    rewardCode     = `JESTFID${Date.now()}`;
    usedRewardCode = `JESTUSED${Date.now()}`;
    await pool.execute(
      `INSERT INTO loyalty_rewards (user_id, tier_id, code, type, value, status, expires_at)
       VALUES (?, ?, ?, 'fixed', 20, 'available', DATE_ADD(NOW(), INTERVAL 30 DAY)),
              (?, ?, ?, 'fixed', 20, 'used',      DATE_ADD(NOW(), INTERVAL 30 DAY))`,
      [owner.userId, tierId, rewardCode, owner.userId, tierId, usedRewardCode]
    );
  });

  afterAll(async () => {
    await pool.execute('DELETE FROM loyalty_rewards WHERE tier_id = ?', [tierId]);
    await pool.execute('DELETE FROM loyalty_tiers WHERE id = ?', [tierId]);
  });

  test('accepte le bon de la cliente connectée et renvoie la remise', async () => {
    const res = await request(app)
      .post('/api/v1/coupons/validate')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ code: rewardCode, subtotal: 50 });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ code: rewardCode, type: 'fixed', value: 20, discount: 20 });
  });

  test('plafonne la remise au sous-total', async () => {
    const res = await request(app)
      .post('/api/v1/coupons/validate')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ code: rewardCode, subtotal: 12.5 });

    expect(res.status).toBe(200);
    expect(res.body.data.discount).toBe(12.5);
  });

  test('refuse le bon d\'une autre cliente, avec le message d\'un code inconnu', async () => {
    const other = await registerVerifiedUser('reward.other');
    const res = await request(app)
      .post('/api/v1/coupons/validate')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ code: rewardCode, subtotal: 50 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Code invalide ou inactif.');
  });

  test('refuse le bon sans connexion', async () => {
    const res = await request(app)
      .post('/api/v1/coupons/validate')
      .send({ code: rewardCode, subtotal: 50 });

    expect(res.status).toBe(400);
  });

  test('indique qu\'un bon a déjà été utilisé', async () => {
    const res = await request(app)
      .post('/api/v1/coupons/validate')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ code: usedRewardCode, subtotal: 50 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/déjà été utilisé/);
  });
});
