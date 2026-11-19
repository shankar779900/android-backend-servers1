const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getScratchCardRewardRange,
  generateScratchCardReward,
  calculateTotalScratchRewards,
} = require('../services/scratchCardRewards');

test('scratch-card reward ranges follow the investment tiers', () => {
  assert.deepEqual(getScratchCardRewardRange(4999), { min: 1, max: 50 });
  assert.deepEqual(getScratchCardRewardRange(5000), { min: 50, max: 200 });
  assert.deepEqual(getScratchCardRewardRange(20000), { min: 50, max: 200 });
  assert.deepEqual(getScratchCardRewardRange(20001), { min: 200, max: 500 });
  assert.deepEqual(getScratchCardRewardRange(49999), { min: 200, max: 500 });
  assert.deepEqual(getScratchCardRewardRange(50000), { min: 500, max: 800 });
  assert.deepEqual(getScratchCardRewardRange(100000), { min: 500, max: 800 });
  assert.deepEqual(getScratchCardRewardRange(100001), { min: 700, max: 1000 });
});

test('scratch-card amounts are random integer values within the assigned tier', () => {
  for (const [investmentAmount, min, max] of [
    [1000, 1, 50],
    [5000, 50, 200],
    [25000, 200, 500],
    [50000, 500, 800],
    [150000, 700, 1000],
  ]) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const reward = generateScratchCardReward(investmentAmount);
      assert.equal(Number.isInteger(reward), true);
      assert.ok(reward >= min && reward <= max);
    }
  }
  assert.equal(generateScratchCardReward(0), null);
});

test('total scratch rewards persist from credited transactions and include legacy scratched cards once', () => {
  const total = calculateTotalScratchRewards(
    [
      { investmentTransactionId: 'investment-1', scratchedAt: new Date(), rewardAmount: 100 },
      { investmentTransactionId: 'investment-2', scratchedAt: new Date(), rewardAmount: 75 },
      { investmentTransactionId: 'investment-3', scratchedAt: null, rewardAmount: 50 },
    ],
    [
      { referenceTxnId: 'investment-1', amount: 100 },
      { referenceTxnId: 'deleted-investment', amount: 25 },
    ],
  );

  assert.equal(total, 200);
});