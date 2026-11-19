const crypto = require('crypto');

function getScratchCardRewardRange(investmentAmount) {
  const amount = Number(investmentAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (amount < 5000) return { min: 1, max: 50 };
  if (amount <= 20000) return { min: 51, max: 100 };
  if (amount < 50000) return { min: 101, max: 200 };
  if (amount <= 100000) return { min: 201, max: 350 };
  return { min: 351, max: 500 };
}

function generateScratchCardReward(investmentAmount) {
  const range = getScratchCardRewardRange(investmentAmount);
  if (!range) return null;
  return crypto.randomInt(range.min, range.max + 1);
}

function calculateTotalScratchRewards(cards, rewardTransactions) {
  const cardsByInvestmentId = new Map(
    cards.map((card) => [card.investmentTransactionId, card]),
  );
  const creditedInvestmentIds = new Set();
  const creditedWithoutCardTotal = rewardTransactions.reduce(
    (total, transaction) => {
      const investmentId = transaction.referenceTxnId;
      if (!investmentId || creditedInvestmentIds.has(investmentId)) return total;
      creditedInvestmentIds.add(investmentId);
      if (cardsByInvestmentId.get(investmentId)?.scratchedAt) return total;
      return total + Number(transaction.amount || 0);
    },
    0,
  );
  const scratchedCardTotal = cards.reduce((total, card) => (
    card.scratchedAt
      ? total + Number(card.rewardAmount || 0)
      : total
  ), 0);

  return creditedWithoutCardTotal + scratchedCardTotal;
}

module.exports = {
  getScratchCardRewardRange,
  generateScratchCardReward,
  calculateTotalScratchRewards,
};