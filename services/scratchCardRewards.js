const crypto = require('crypto');

function getScratchCardRewardRange(investmentAmount) {
  const amount = Number(investmentAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (amount < 5000) return { min: 1, max: 100 };
  if (amount <= 20000) return { min: 100, max: 300 };
  if (amount <= 100000) return { min: 300, max: 500 };
  return { min: 500, max: 1000 };
}

function generateScratchCardReward(investmentAmount) {
  const range = getScratchCardRewardRange(investmentAmount);
  if (!range) return null;
  return crypto.randomInt(range.min, range.max + 1);
}

module.exports = {
  getScratchCardRewardRange,
  generateScratchCardReward,
};