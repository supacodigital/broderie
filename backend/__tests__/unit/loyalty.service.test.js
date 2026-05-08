// Tests unitaires loyalty.service — mock complet du repository
// Aucune connexion BDD requise

jest.mock('../../repositories/loyalty.repository');
const loyaltyRepository = require('../../repositories/loyalty.repository');
const loyaltyService    = require('../../services/loyalty.service');
const { roundCHF }      = require('../../utils/chf.utils');

beforeEach(() => jest.clearAllMocks());

describe('loyalty.service — processOrderEarning()', () => {

  test('crée le compte si nécessaire puis enregistre la transaction earn', async () => {
    loyaltyRepository.createAccount.mockResolvedValue();
    loyaltyRepository.addTransaction.mockResolvedValue();
    loyaltyRepository.findAccount.mockResolvedValue({ total_spend_chf: '40.00' });
    loyaltyRepository.findTiers.mockResolvedValue([]);

    await loyaltyService.processOrderEarning(1, 10, 40);

    expect(loyaltyRepository.createAccount).toHaveBeenCalledWith(1);
    expect(loyaltyRepository.addTransaction).toHaveBeenCalledWith(1, 10, roundCHF(40), 'earn');
  });

  test('ne génère pas de récompense si le total est sous le palier', async () => {
    loyaltyRepository.createAccount.mockResolvedValue();
    loyaltyRepository.addTransaction.mockResolvedValue();
    loyaltyRepository.findAccount.mockResolvedValue({ total_spend_chf: '150.00' });
    loyaltyRepository.findTiers.mockResolvedValue([
      { id: 1, min_spend_chf: '200.00', reward_type: 'fixed', reward_value: '20.00', reward_validity_days: 90 },
    ]);

    await loyaltyService.processOrderEarning(1, 5, 150);

    expect(loyaltyRepository.createReward).not.toHaveBeenCalled();
    expect(loyaltyRepository.updateAccountTier).not.toHaveBeenCalled();
  });

  test('génère une récompense quand le palier est atteint pour la première fois', async () => {
    loyaltyRepository.createAccount.mockResolvedValue();
    loyaltyRepository.addTransaction.mockResolvedValue();
    loyaltyRepository.findAccount.mockResolvedValue({ total_spend_chf: '220.00' });
    loyaltyRepository.findTiers.mockResolvedValue([
      { id: 1, min_spend_chf: '200.00', reward_type: 'fixed', reward_value: '20.00', reward_validity_days: 90 },
    ]);
    loyaltyRepository.tierAlreadyRewarded.mockResolvedValue(false);
    loyaltyRepository.createReward.mockResolvedValue();
    loyaltyRepository.updateAccountTier.mockResolvedValue();

    await loyaltyService.processOrderEarning(1, 5, 220);

    expect(loyaltyRepository.tierAlreadyRewarded).toHaveBeenCalledWith(1, 1);
    expect(loyaltyRepository.createReward).toHaveBeenCalledWith(1, 1, {
      type: 'fixed',
      value: '20.00',
      validityDays: 90,
    });
    expect(loyaltyRepository.updateAccountTier).toHaveBeenCalledWith(1, 1);
  });

  test('ne régénère pas de récompense si le palier a déjà été atteint', async () => {
    loyaltyRepository.createAccount.mockResolvedValue();
    loyaltyRepository.addTransaction.mockResolvedValue();
    loyaltyRepository.findAccount.mockResolvedValue({ total_spend_chf: '350.00' });
    loyaltyRepository.findTiers.mockResolvedValue([
      { id: 1, min_spend_chf: '200.00', reward_type: 'fixed', reward_value: '20.00', reward_validity_days: 90 },
    ]);
    loyaltyRepository.tierAlreadyRewarded.mockResolvedValue(true);

    await loyaltyService.processOrderEarning(1, 7, 350);

    expect(loyaltyRepository.createReward).not.toHaveBeenCalled();
  });

  test('gère plusieurs paliers et génère un bon par palier non encore atteint', async () => {
    loyaltyRepository.createAccount.mockResolvedValue();
    loyaltyRepository.addTransaction.mockResolvedValue();
    loyaltyRepository.findAccount.mockResolvedValue({ total_spend_chf: '600.00' });
    loyaltyRepository.findTiers.mockResolvedValue([
      { id: 1, min_spend_chf: '200.00', reward_type: 'fixed', reward_value: '20.00', reward_validity_days: 90 },
      { id: 2, min_spend_chf: '500.00', reward_type: 'percent', reward_value: '10', reward_validity_days: 60 },
    ]);
    // Palier 1 déjà atteint, palier 2 nouveau
    loyaltyRepository.tierAlreadyRewarded
      .mockResolvedValueOnce(true)  // palier 1
      .mockResolvedValueOnce(false); // palier 2
    loyaltyRepository.createReward.mockResolvedValue();
    loyaltyRepository.updateAccountTier.mockResolvedValue();

    await loyaltyService.processOrderEarning(1, 8, 600);

    expect(loyaltyRepository.createReward).toHaveBeenCalledTimes(1);
    expect(loyaltyRepository.createReward).toHaveBeenCalledWith(1, 2, expect.any(Object));
  });
});

describe('loyalty.service — processRefund()', () => {

  test('enregistre une transaction refund avec le montant arrondi', async () => {
    loyaltyRepository.addTransaction.mockResolvedValue();

    await loyaltyService.processRefund(1, 10, 49.90);

    expect(loyaltyRepository.addTransaction).toHaveBeenCalledWith(1, 10, roundCHF(49.90), 'refund');
  });
});

describe('loyalty.service — getAccountSummary()', () => {

  test('retourne account, transactions et tiers', async () => {
    const fakeAccount      = { user_id: 1, total_spend_chf: '100.00', current_tier_id: null };
    const fakeTransactions = [{ id: 1, type: 'earn', amount_chf: '100.00' }];
    const fakeTiers        = [{ id: 1, min_spend_chf: '200.00' }];

    loyaltyRepository.createAccount.mockResolvedValue();
    loyaltyRepository.findAccount.mockResolvedValue(fakeAccount);
    loyaltyRepository.findTransactions.mockResolvedValue(fakeTransactions);
    loyaltyRepository.findTiers.mockResolvedValue(fakeTiers);

    const result = await loyaltyService.getAccountSummary(1);

    expect(result.account).toEqual(fakeAccount);
    expect(result.transactions).toEqual(fakeTransactions);
    expect(result.tiers).toEqual(fakeTiers);
  });
});
