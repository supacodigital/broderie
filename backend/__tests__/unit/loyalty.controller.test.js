// Tests unitaires loyalty.controller (client)

jest.mock('../../services/loyalty.service', () => ({
  getAccountSummary: jest.fn(),
  getRewards:        jest.fn(),
}));

const loyaltyService = require('../../services/loyalty.service');
const { getMe, getRewards } = require('../../controllers/loyalty.controller');

beforeEach(() => jest.clearAllMocks());

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

// ── getMe() ──────────────────────────────────────────────────────────────────

describe('loyalty.controller — getMe()', () => {
  test('retourne le résumé du compte fidélité', async () => {
    const summary = { tier: 'Argent', total_spend_chf: 250 };
    loyaltyService.getAccountSummary.mockResolvedValue(summary);

    const req = { user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();

    await getMe(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: summary });
    expect(loyaltyService.getAccountSummary).toHaveBeenCalledWith(1);
  });

  test('appelle next en cas d\'erreur', async () => {
    loyaltyService.getAccountSummary.mockRejectedValue(new Error('DB'));
    const req = { user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();
    await getMe(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── getRewards() ──────────────────────────────────────────────────────────────

describe('loyalty.controller — getRewards()', () => {
  test('retourne les bons de réduction disponibles', async () => {
    const rewards = [{ id: 1, code: 'FID-ABC', status: 'available' }];
    loyaltyService.getRewards.mockResolvedValue(rewards);

    const req = { user: { id: 2 } };
    const res = makeRes();
    const next = jest.fn();

    await getRewards(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: rewards });
    expect(loyaltyService.getRewards).toHaveBeenCalledWith(2);
  });

  test('appelle next en cas d\'erreur', async () => {
    loyaltyService.getRewards.mockRejectedValue(new Error('DB'));
    const req = { user: { id: 2 } };
    const res = makeRes();
    const next = jest.fn();
    await getRewards(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
