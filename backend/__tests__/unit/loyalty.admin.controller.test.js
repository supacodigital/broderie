// Tests unitaires admin/loyalty.controller

jest.mock('../../repositories/loyalty.repository', () => ({
  findAllTiers:  jest.fn(),
  createTier:    jest.fn(),
  updateTier:    jest.fn(),
  deleteTier:    jest.fn(),
  findAllAccounts: jest.fn(),
  getGlobalKpis:   jest.fn(),
  findAllRewards:  jest.fn(),
}));

const loyaltyRepository = require('../../repositories/loyalty.repository');
const {
  getTiers, createTier, updateTier, deleteTier,
  getAccounts, getKpis, getRewards,
} = require('../../controllers/admin/loyalty.controller');

beforeEach(() => jest.clearAllMocks());

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

// ── getTiers() ────────────────────────────────────────────────────────────────

describe('admin/loyalty.controller — getTiers()', () => {
  test('retourne la liste des paliers', async () => {
    const tiers = [{ id: 1, name: 'Argent', min_spend_chf: 200 }];
    loyaltyRepository.findAllTiers.mockResolvedValue(tiers);
    const res = makeRes();
    await getTiers({}, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, data: tiers });
  });
});

// ── createTier() ──────────────────────────────────────────────────────────────

describe('admin/loyalty.controller — createTier()', () => {
  test('crée un palier et retourne 201', async () => {
    loyaltyRepository.createTier.mockResolvedValue(3);
    const newTier = { id: 3, name: 'Or', min_spend_chf: 500, reward_type: 'fixed' };
    loyaltyRepository.findAllTiers.mockResolvedValue([newTier]);

    const req = { body: { name: 'Or', minSpendChf: 500, rewardType: 'fixed', rewardValue: 30, rewardValidityDays: 90, isActive: true, sortOrder: 2 } };
    const res = makeRes();
    const next = jest.fn();

    await createTier(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: newTier });
  });

  test('retourne 400 si champs obligatoires manquants', async () => {
    const req = { body: { name: 'Bronze' } }; // minSpendChf, rewardType, rewardValue manquants
    const res = makeRes();
    const next = jest.fn();
    await createTier(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  test('retourne 400 si rewardType invalide', async () => {
    const req = { body: { name: 'Or', minSpendChf: 500, rewardType: 'invalid', rewardValue: 20 } };
    const res = makeRes();
    const next = jest.fn();
    await createTier(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});

// ── updateTier() ──────────────────────────────────────────────────────────────

describe('admin/loyalty.controller — updateTier()', () => {
  test('met à jour le palier et retourne les données', async () => {
    loyaltyRepository.updateTier.mockResolvedValue();
    const tier = { id: 1, name: 'Argent mis à jour' };
    loyaltyRepository.findAllTiers.mockResolvedValue([tier]);

    const req = { params: { id: '1' }, body: { name: 'Argent mis à jour', minSpendChf: 200, rewardType: 'fixed', rewardValue: 20 } };
    const res = makeRes();
    await updateTier(req, res, jest.fn());
    expect(loyaltyRepository.updateTier).toHaveBeenCalledWith(1, expect.any(Object));
    expect(res.json).toHaveBeenCalledWith({ success: true, data: tier });
  });

  test('retourne 404 si palier introuvable après mise à jour', async () => {
    loyaltyRepository.updateTier.mockResolvedValue();
    loyaltyRepository.findAllTiers.mockResolvedValue([{ id: 2 }]);

    const req = { params: { id: '99' }, body: { name: 'X', minSpendChf: 100, rewardType: 'fixed', rewardValue: 5 } };
    const res = makeRes();
    const next = jest.fn();
    await updateTier(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

// ── deleteTier() ──────────────────────────────────────────────────────────────

describe('admin/loyalty.controller — deleteTier()', () => {
  test('supprime le palier et retourne succès', async () => {
    loyaltyRepository.deleteTier.mockResolvedValue(true);
    const req = { params: { id: '1' } };
    const res = makeRes();
    await deleteTier(req, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(loyaltyRepository.deleteTier).toHaveBeenCalledWith(1);
  });

  test('retourne 404 si palier inexistant', async () => {
    loyaltyRepository.deleteTier.mockResolvedValue(false);
    const req = { params: { id: '99' } };
    const res = makeRes();
    const next = jest.fn();
    await deleteTier(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});

// ── getAccounts() ─────────────────────────────────────────────────────────────

describe('admin/loyalty.controller — getAccounts()', () => {
  test('retourne les comptes fidélité paginés', async () => {
    const rows = [{ user_id: 1, total_spend_chf: 300 }];
    loyaltyRepository.findAllAccounts.mockResolvedValue({ rows, total: 1 });

    const req = { query: { page: '1', limit: '20', q: '' } };
    const res = makeRes();
    await getAccounts(req, res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: rows,
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  test('applique la limite max de 100', async () => {
    loyaltyRepository.findAllAccounts.mockResolvedValue({ rows: [], total: 0 });
    const req = { query: { limit: '999' } };
    const res = makeRes();
    await getAccounts(req, res, jest.fn());
    expect(loyaltyRepository.findAllAccounts).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });
});

// ── getKpis() ─────────────────────────────────────────────────────────────────

describe('admin/loyalty.controller — getKpis()', () => {
  test('retourne les KPIs globaux', async () => {
    const kpis = { total_accounts: 50, total_rewards: 20 };
    loyaltyRepository.getGlobalKpis.mockResolvedValue(kpis);
    const res = makeRes();
    await getKpis({}, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, data: kpis });
  });
});

// ── getRewards() ──────────────────────────────────────────────────────────────

describe('admin/loyalty.controller — getRewards()', () => {
  test('retourne les bons fidélité paginés avec filtre statut', async () => {
    const rows = [{ id: 1, code: 'FID-ABC', status: 'available' }];
    loyaltyRepository.findAllRewards.mockResolvedValue({ rows, total: 1 });

    const req = { query: { page: '1', limit: '20', status: 'available' } };
    const res = makeRes();
    await getRewards(req, res, jest.fn());

    expect(loyaltyRepository.findAllRewards).toHaveBeenCalledWith({ page: 1, limit: 20, status: 'available' });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: rows }));
  });
});
