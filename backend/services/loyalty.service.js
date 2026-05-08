const loyaltyRepository = require('../repositories/loyalty.repository');
const { roundCHF } = require('../utils/chf.utils');

// Appelé après confirmation de paiement — crédite le montant et vérifie les paliers
const processOrderEarning = async (userId, orderId, totalChf) => {
  // Crée le compte fidélité si c'est la première commande
  await loyaltyRepository.createAccount(userId);

  // Enregistre la transaction earn
  await loyaltyRepository.addTransaction(userId, orderId, roundCHF(totalChf), 'earn');

  // Récupère le compte mis à jour et les paliers actifs
  const account = await loyaltyRepository.findAccount(userId);
  const tiers = await loyaltyRepository.findTiers();

  // Vérifie si de nouveaux paliers sont atteints (un seul bon par palier, à vie)
  for (const tier of tiers) {
    if (parseFloat(account.total_spend_chf) >= parseFloat(tier.min_spend_chf)) {
      const alreadyRewarded = await loyaltyRepository.tierAlreadyRewarded(userId, tier.id);
      if (!alreadyRewarded) {
        await loyaltyRepository.createReward(userId, tier.id, {
          type: tier.reward_type,
          value: tier.reward_value,
          validityDays: tier.reward_validity_days,
        });
        await loyaltyRepository.updateAccountTier(userId, tier.id);
      }
    }
  }
};

// Déduit le montant en cas de remboursement
const processRefund = async (userId, orderId, totalChf) => {
  await loyaltyRepository.addTransaction(userId, orderId, roundCHF(totalChf), 'refund');
};

const getAccountSummary = async (userId) => {
  await loyaltyRepository.createAccount(userId);
  const account = await loyaltyRepository.findAccount(userId);
  const transactions = await loyaltyRepository.findTransactions(userId);
  const tiers = await loyaltyRepository.findTiers();
  return { account, transactions, tiers };
};

const getRewards = async (userId) => {
  return loyaltyRepository.findRewards(userId);
};

module.exports = { processOrderEarning, processRefund, getAccountSummary, getRewards };
