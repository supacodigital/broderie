// Tests unitaires loyalty.repository — pool mocké, aucune BDD requise

jest.mock('../../config/db', () => ({
  pool: {
    execute:       jest.fn(),
    query:         jest.fn(),
    getConnection: jest.fn(),
  },
}));

const { pool }            = require('../../config/db');
const loyaltyRepository   = require('../../repositories/loyalty.repository');

beforeEach(() => jest.clearAllMocks());

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConnection(executeResponses = []) {
  let callIndex = 0;
  const conn = {
    beginTransaction: jest.fn().mockResolvedValue(),
    execute: jest.fn().mockImplementation(() => {
      const res = executeResponses[callIndex] ?? [[{ affectedRows: 1 }]];
      callIndex++;
      return Promise.resolve(res);
    }),
    commit:   jest.fn().mockResolvedValue(),
    rollback: jest.fn().mockResolvedValue(),
    release:  jest.fn(),
  };
  return conn;
}

// ── findAccount() ─────────────────────────────────────────────────────────────

describe('loyalty.repository — findAccount()', () => {
  test('retourne le compte fidélité avec le palier', async () => {
    const fakeAccount = { id: 1, total_spend_chf: '120.00', current_tier_id: null };
    pool.execute.mockResolvedValue([[fakeAccount]]);

    const result = await loyaltyRepository.findAccount(1);
    expect(result).toEqual(fakeAccount);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('FROM loyalty_accounts la'), [1]
    );
  });

  test('retourne null si pas de compte', async () => {
    pool.execute.mockResolvedValue([[]]);
    const result = await loyaltyRepository.findAccount(99);
    expect(result).toBeNull();
  });
});

// ── createAccount() ───────────────────────────────────────────────────────────

describe('loyalty.repository — createAccount()', () => {
  test('insère avec INSERT IGNORE (idempotent)', async () => {
    pool.execute.mockResolvedValue([{}]);
    await loyaltyRepository.createAccount(1);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT IGNORE INTO loyalty_accounts'), [1]
    );
  });
});

// ── findRewards() ─────────────────────────────────────────────────────────────

describe('loyalty.repository — findRewards()', () => {
  test('retourne les bons disponibles triés par date', async () => {
    const fakeRewards = [{ id: 1, code: 'FID-ABC', status: 'available' }];
    pool.execute.mockResolvedValue([fakeRewards]);
    const result = await loyaltyRepository.findRewards(1);
    expect(result).toEqual(fakeRewards);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('FROM loyalty_rewards lr'), [1]
    );
  });
});

// ── findTransactions() ────────────────────────────────────────────────────────

describe('loyalty.repository — findTransactions()', () => {
  test('retourne les 50 dernières transactions', async () => {
    const fakeTx = [{ id: 1, amount_chf: '49.90', type: 'earn' }];
    pool.execute.mockResolvedValue([fakeTx]);
    const result = await loyaltyRepository.findTransactions(1);
    expect(result).toEqual(fakeTx);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT 50'), [1]
    );
  });
});

// ── findTiers() ───────────────────────────────────────────────────────────────

describe('loyalty.repository — findTiers()', () => {
  test('retourne uniquement les paliers actifs triés par seuil', async () => {
    const fakeTiers = [
      { id: 1, name: 'Argent', min_spend_chf: '200.00', is_active: 1 },
      { id: 2, name: 'Or',     min_spend_chf: '500.00', is_active: 1 },
    ];
    pool.execute.mockResolvedValue([fakeTiers]);
    const result = await loyaltyRepository.findTiers();
    expect(result).toEqual(fakeTiers);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('is_active = 1')
    );
  });
});

// ── findAllTiers() ────────────────────────────────────────────────────────────

describe('loyalty.repository — findAllTiers()', () => {
  test('retourne tous les paliers (actifs + inactifs)', async () => {
    const allTiers = [
      { id: 1, is_active: 1 }, { id: 2, is_active: 0 },
    ];
    pool.execute.mockResolvedValue([allTiers]);
    const result = await loyaltyRepository.findAllTiers();
    expect(result).toHaveLength(2);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('FROM loyalty_tiers')
    );
  });
});

// ── createTier() ─────────────────────────────────────────────────────────────

describe('loyalty.repository — createTier()', () => {
  test('insère le palier et retourne l\'insertId', async () => {
    pool.execute.mockResolvedValue([{ insertId: 3 }]);
    const id = await loyaltyRepository.createTier({
      name: 'Platine', minSpendChf: 1000, rewardType: 'fixed',
      rewardValue: 50, rewardValidityDays: 120, isActive: true, sortOrder: 3,
    });
    expect(id).toBe(3);
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO loyalty_tiers'),
      expect.arrayContaining(['Platine', 1000, 'fixed', 50])
    );
  });

  test('utilise les valeurs par défaut pour validityDays et sortOrder', async () => {
    pool.execute.mockResolvedValue([{ insertId: 4 }]);
    await loyaltyRepository.createTier({
      name: 'Bronze', minSpendChf: 100, rewardType: 'percent', rewardValue: 5,
    });
    expect(pool.execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([90, 1, 0]) // validityDays=90, isActive=1 (true), sortOrder=0
    );
  });
});

// ── updateTier() ─────────────────────────────────────────────────────────────

describe('loyalty.repository — updateTier()', () => {
  test('met à jour tous les champs du palier', async () => {
    pool.execute.mockResolvedValue([{}]);
    await loyaltyRepository.updateTier(1, {
      name: 'Argent+', minSpendChf: 250, rewardType: 'fixed',
      rewardValue: 25, rewardValidityDays: 90, isActive: true, sortOrder: 2,
    });
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE loyalty_tiers SET'),
      expect.arrayContaining(['Argent+', 250, 1])
    );
  });
});

// ── deleteTier() ─────────────────────────────────────────────────────────────

describe('loyalty.repository — deleteTier()', () => {
  test('supprime et retourne true si affecté', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 1 }]);
    const result = await loyaltyRepository.deleteTier(1);
    expect(result).toBe(true);
  });

  test('retourne false si palier inexistant', async () => {
    pool.execute.mockResolvedValue([{ affectedRows: 0 }]);
    const result = await loyaltyRepository.deleteTier(99);
    expect(result).toBe(false);
  });
});

// ── addTransaction() ──────────────────────────────────────────────────────────

describe('loyalty.repository — addTransaction()', () => {
  test('insère la transaction earn et met à jour total_spend_chf', async () => {
    const conn = makeConnection();
    pool.getConnection.mockResolvedValue(conn);

    await loyaltyRepository.addTransaction(1, 10, 49.90, 'earn');

    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.execute).toHaveBeenCalledTimes(2);
    expect(conn.execute).toHaveBeenNthCalledWith(1,
      expect.stringContaining('INSERT INTO loyalty_transactions'), [1, 10, 49.90, 'earn']
    );
    expect(conn.execute).toHaveBeenNthCalledWith(2,
      expect.stringContaining('UPDATE loyalty_accounts SET total_spend_chf'),
      [49.90, 1]
    );
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test('déduit le montant pour une transaction refund', async () => {
    const conn = makeConnection();
    pool.getConnection.mockResolvedValue(conn);

    await loyaltyRepository.addTransaction(1, 11, 30.00, 'refund');

    // delta = -30 (refund)
    expect(conn.execute).toHaveBeenNthCalledWith(2,
      expect.stringContaining('GREATEST(0, total_spend_chf + ?)'),
      [-30.00, 1]
    );
  });

  test('n\'update pas total_spend_chf pour type redeem (delta=0)', async () => {
    const conn = makeConnection();
    pool.getConnection.mockResolvedValue(conn);

    await loyaltyRepository.addTransaction(1, 12, 5.00, 'redeem');

    // delta=0 donc pas de 2ème execute
    expect(conn.execute).toHaveBeenCalledTimes(1);
  });

  test('rollback si erreur SQL', async () => {
    const conn = makeConnection();
    conn.execute = jest.fn().mockRejectedValue(new Error('SQL fail'));
    pool.getConnection.mockResolvedValue(conn);

    await expect(loyaltyRepository.addTransaction(1, 10, 50, 'earn')).rejects.toThrow('SQL fail');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});

// ── createRewardAndUpdateTier() ───────────────────────────────────────────────

describe('loyalty.repository — createRewardAndUpdateTier()', () => {
  test('insère le bon et met à jour current_tier_id, retourne le code', async () => {
    const conn = makeConnection();
    pool.getConnection.mockResolvedValue(conn);

    const code = await loyaltyRepository.createRewardAndUpdateTier(1, 2, {
      type: 'fixed', value: '20.00', validityDays: 90,
    });

    expect(code).toMatch(/^FID-[0-9A-F]{16}$/);
    expect(conn.execute).toHaveBeenNthCalledWith(1,
      expect.stringContaining('INSERT INTO loyalty_rewards'), expect.arrayContaining([1, 2, 'fixed'])
    );
    expect(conn.execute).toHaveBeenNthCalledWith(2,
      expect.stringContaining('UPDATE loyalty_accounts SET current_tier_id = ?'), [2, 1]
    );
    expect(conn.commit).toHaveBeenCalled();
  });

  test('rollback si erreur et propage l\'exception', async () => {
    const conn = makeConnection();
    conn.execute = jest.fn().mockRejectedValue(new Error('constraint'));
    pool.getConnection.mockResolvedValue(conn);

    await expect(
      loyaltyRepository.createRewardAndUpdateTier(1, 2, { type: 'fixed', value: '20.00', validityDays: 90 })
    ).rejects.toThrow('constraint');
    expect(conn.rollback).toHaveBeenCalled();
  });
});

// ── tierAlreadyRewarded() ─────────────────────────────────────────────────────

describe('loyalty.repository — tierAlreadyRewarded()', () => {
  test('retourne true si un bon existe déjà pour ce palier', async () => {
    pool.execute.mockResolvedValue([[{ id: 1 }]]);
    expect(await loyaltyRepository.tierAlreadyRewarded(1, 2)).toBe(true);
  });

  test('retourne false si aucun bon', async () => {
    pool.execute.mockResolvedValue([[]]);
    expect(await loyaltyRepository.tierAlreadyRewarded(1, 2)).toBe(false);
  });
});

// ── findAllAccounts() ─────────────────────────────────────────────────────────

describe('loyalty.repository — findAllAccounts()', () => {
  test('retourne la pagination et les lignes sans filtre', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 3 }]])          // COUNT
      .mockResolvedValueOnce([[{ user_id: 1 }, { user_id: 2 }, { user_id: 3 }]]);  // SELECT

    const result = await loyaltyRepository.findAllAccounts({ page: 1, limit: 20 });
    expect(result.total).toBe(3);
    expect(result.rows).toHaveLength(3);
  });

  test('filtre par search (prénom/nom/email)', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ user_id: 5 }]]);

    const result = await loyaltyRepository.findAllAccounts({ page: 1, limit: 20, search: 'julie' });
    expect(result.rows).toHaveLength(1);
    // Vérifie que le terme de recherche est bien passé au query
    const queryCall = pool.query.mock.calls[0];
    expect(queryCall[1]).toContain('%julie%');
  });
});

// ── getGlobalKpis() ───────────────────────────────────────────────────────────

describe('loyalty.repository — getGlobalKpis()', () => {
  test('retourne les KPIs agrégés', async () => {
    pool.execute
      .mockResolvedValueOnce([[{ total_accounts: 42 }]])
      .mockResolvedValueOnce([[{
        total_rewards: 15,
        available_rewards: 5,
        used_rewards: 8,
        expired_rewards: 2,
      }]]);

    const result = await loyaltyRepository.getGlobalKpis();
    expect(result.totalAccounts).toBe(42);
    expect(result.availableRewards).toBe(5);
    expect(result.usedRewards).toBe(8);
  });
});

// ── findAllRewards() ──────────────────────────────────────────────────────────

describe('loyalty.repository — findAllRewards()', () => {
  test('retourne tous les bons sans filtre statut', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 2 }]])
      .mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]);

    const result = await loyaltyRepository.findAllRewards({ page: 1, limit: 20 });
    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(2);
  });

  test('filtre par statut si fourni', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[{ id: 3, status: 'available' }]]);

    const result = await loyaltyRepository.findAllRewards({ page: 1, limit: 20, status: 'available' });
    expect(result.rows[0].status).toBe('available');
    const countCall = pool.query.mock.calls[0];
    expect(countCall[1]).toContain('available');
  });
});
