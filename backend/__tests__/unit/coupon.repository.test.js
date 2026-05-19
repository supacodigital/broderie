// Tests unitaires coupon.repository — pool mocké
// La logique pure de validate() est déjà couverte dans coupon.repository.test.js (logique)
// Ce fichier couvre les appels SQL réels : findAll, findById, findByCode, create, update, remove, validate, incrementUsage

jest.mock('../../config/db', () => ({
  pool: {
    execute: jest.fn(),
    query:   jest.fn(),
  },
}));

const { pool } = require('../../config/db');
const repo     = require('../../repositories/coupon.repository');

beforeEach(() => jest.clearAllMocks());

const fakeCoupon = {
  id: 1, code: 'BIENVENUE10', type: 'percent', value: '10',
  min_order_chf: '0.00', usage_limit: null, used_count: 0,
  expires_at: null, is_active: 1,
};

// ── findAll() ────────────────────────────────────────────────────────────────

describe('coupon.repository — findAll()', () => {
  test('retourne la liste paginée avec le total', async () => {
    pool.execute.mockResolvedValue([[{ total: 3 }]]);
    pool.query.mockResolvedValue([[fakeCoupon, { ...fakeCoupon, id: 2 }, { ...fakeCoupon, id: 3 }]]);

    const result = await repo.findAll({ page: 1, limit: 100 });
    expect(result.total).toBe(3);
    expect(result.rows).toHaveLength(3);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('SELECT COUNT(*) AS total FROM coupons')
    );
  });
});

// ── findById() ────────────────────────────────────────────────────────────────

describe('coupon.repository — findById()', () => {
  test('retourne le coupon par id', async () => {
    pool.execute.mockResolvedValue([[fakeCoupon]]);
    const result = await repo.findById(1);
    expect(result).toEqual(fakeCoupon);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = ?'), [1]
    );
  });

  test('retourne null si introuvable', async () => {
    pool.execute.mockResolvedValue([[]]);
    expect(await repo.findById(99)).toBeNull();
  });
});

// ── findByCode() ──────────────────────────────────────────────────────────────

describe('coupon.repository — findByCode()', () => {
  test('retourne le coupon par code', async () => {
    pool.execute.mockResolvedValue([[{ id: 1 }]]);
    const result = await repo.findByCode('BIENVENUE10');
    expect(result).toEqual({ id: 1 });
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('WHERE code = ?'), ['BIENVENUE10']
    );
  });

  test('retourne null si code inexistant', async () => {
    pool.execute.mockResolvedValue([[]]);
    expect(await repo.findByCode('INEXISTANT')).toBeNull();
  });

  test('exclut un id lors de la vérification d\'unicité (edit)', async () => {
    pool.execute.mockResolvedValue([[]]);
    await repo.findByCode('BIENVENUE10', 3);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('id != ?'), ['BIENVENUE10', 3]
    );
  });
});

// ── create() ────────────────────────────────────────────────────────────────

describe('coupon.repository — create()', () => {
  test('insère le coupon en majuscules et retourne l\'insertId', async () => {
    pool.execute.mockResolvedValue([{ insertId: 7 }]);

    const id = await repo.create({
      code: 'promo10', type: 'percent', value: 10,
      minOrderChf: 30, usageLimit: 100, expiresAt: null, isActive: true,
    });

    expect(id).toBe(7);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO coupons'),
      expect.arrayContaining(['PROMO10', 'percent', 10])
    );
  });

  test('convertit expiresAt ISO en format DATE MySQL', async () => {
    pool.execute.mockResolvedValue([{ insertId: 8 }]);

    await repo.create({
      code: 'ETE2026', type: 'fixed', value: 5,
      expiresAt: '2026-08-31T00:00:00.000Z', isActive: true,
    });

    const params = pool.execute.mock.calls[0][1];
    expect(params[5]).toBe('2026-08-31');
  });

  test('expiresAt null reste null', async () => {
    pool.execute.mockResolvedValue([{ insertId: 9 }]);
    await repo.create({ code: 'NOLIMIT', type: 'fixed', value: 5, isActive: true });
    const params = pool.execute.mock.calls[0][1];
    expect(params[5]).toBeNull();
  });

  test('usageLimit null si non fourni', async () => {
    pool.execute.mockResolvedValue([{ insertId: 10 }]);
    await repo.create({ code: 'ILLIMITE', type: 'percent', value: 5, isActive: true });
    const params = pool.execute.mock.calls[0][1];
    expect(params[4]).toBeNull();
  });

  test('isActive = 0 si explicitement false', async () => {
    pool.execute.mockResolvedValue([{ insertId: 11 }]);
    await repo.create({ code: 'INACTIF', type: 'fixed', value: 5, isActive: false });
    const params = pool.execute.mock.calls[0][1];
    expect(params[6]).toBe(0);
  });
});

// ── update() ────────────────────────────────────────────────────────────────

describe('coupon.repository — update()', () => {
  test('met à jour le coupon en forçant le code en majuscules', async () => {
    pool.execute.mockResolvedValue([{}]);

    await repo.update(1, {
      code: 'bienvenue10', type: 'percent', value: 10,
      minOrderChf: 0, usageLimit: null, expiresAt: null, isActive: true,
    });

    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE coupons'),
      expect.arrayContaining(['BIENVENUE10'])
    );
  });
});

// ── remove() ────────────────────────────────────────────────────────────────

describe('coupon.repository — remove()', () => {
  test('retourne true si supprimé', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 1 }]);
    expect(await repo.remove(1)).toBe(true);
  });

  test('retourne false si inexistant', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 0 }]);
    expect(await repo.remove(99)).toBe(false);
  });
});

// ── validate() ────────────────────────────────────────────────────────────────

describe('coupon.repository — validate() (avec pool)', () => {
  test('retourne invalid si code inexistant en BDD', async () => {
    pool.execute.mockResolvedValue([[]]);
    const result = await repo.validate('INCONNU', 50);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/invalide/i);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('is_active = 1'), ['INCONNU']
    );
  });

  test('formate le code en majuscules avant la requête', async () => {
    pool.execute.mockResolvedValue([[]]);
    await repo.validate('bienvenue10', 50);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.anything(), ['BIENVENUE10']
    );
  });

  test('retourne valid avec discount percent calculé', async () => {
    pool.execute.mockResolvedValue([[{
      id: 1, code: 'PROMO10', type: 'percent', value: '10',
      min_order_chf: '0', usage_limit: null, used_count: 0, expires_at: null,
    }]]);

    const result = await repo.validate('PROMO10', 50);
    expect(result.valid).toBe(true);
    expect(result.discount).toBe(5); // 10% de 50 = 5
  });

  test('retourne valid avec discount fixed calculé', async () => {
    pool.execute.mockResolvedValue([[{
      id: 2, code: 'FIDELE5', type: 'fixed', value: '5',
      min_order_chf: '0', usage_limit: null, used_count: 0, expires_at: null,
    }]]);

    const result = await repo.validate('FIDELE5', 30);
    expect(result.valid).toBe(true);
    expect(result.discount).toBe(5);
  });

  test('retourne invalid si expiré', async () => {
    pool.execute.mockResolvedValue([[{
      ...fakeCoupon,
      expires_at: new Date(Date.now() - 86400000), // hier
    }]]);

    const result = await repo.validate('BIENVENUE10', 50);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/expir/i);
  });

  test('retourne invalid si limite d\'utilisation atteinte', async () => {
    pool.execute.mockResolvedValue([[{
      ...fakeCoupon, usage_limit: 5, used_count: 5,
    }]]);

    const result = await repo.validate('BIENVENUE10', 50);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/limite/i);
  });

  test('retourne invalid si montant insuffisant', async () => {
    pool.execute.mockResolvedValue([[{
      ...fakeCoupon, min_order_chf: '100',
    }]]);

    const result = await repo.validate('BIENVENUE10', 50);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('CHF 100.00');
  });
});

// ── incrementUsage() ──────────────────────────────────────────────────────────

describe('coupon.repository — incrementUsage()', () => {
  test('incrémente used_count', async () => {
    pool.execute.mockResolvedValue([{}]);
    await repo.incrementUsage(1);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('used_count = used_count + 1'), [1]
    );
  });
});
