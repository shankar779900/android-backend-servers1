const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getScratchCardRewardRange,
  generateScratchCardReward,
  calculateTotalScratchRewards,
} = require('../services/scratchCardRewards');

test('scratch-card reward ranges follow the investment tiers', () => {
  assert.deepEqual(getScratchCardRewardRange(4999), { min: 1, max: 50 });
  assert.deepEqual(getScratchCardRewardRange(5000), { min: 51, max: 100 });
  assert.deepEqual(getScratchCardRewardRange(20000), { min: 51, max: 100 });
  assert.deepEqual(getScratchCardRewardRange(20001), { min: 101, max: 200 });
  assert.deepEqual(getScratchCardRewardRange(49999), { min: 101, max: 200 });
  assert.deepEqual(getScratchCardRewardRange(50000), { min: 201, max: 350 });
  assert.deepEqual(getScratchCardRewardRange(100000), { min: 201, max: 350 });
  assert.deepEqual(getScratchCardRewardRange(100001), { min: 351, max: 500 });
});

test('scratch-card amounts are random integer values within the assigned tier', () => {
  for (const [investmentAmount, min, max] of [
    [1000, 1, 50],
    [5000, 51, 100],
    [25000, 101, 200],
    [50000, 201, 350],
    [150000, 351, 500],
  ]) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const reward = generateScratchCardReward(investmentAmount);
      assert.equal(Number.isInteger(reward), true);
      assert.ok(reward >= min && reward <= max);
    }
  }
  assert.equal(generateScratchCardReward(0), null);
});

test('total rewards count each scratched card once and retain credits for deleted cards', () => {
  const total = calculateTotalScratchRewards(
    [
      { investmentTransactionId: 'investment-1', scratchedAt: new Date(), rewardAmount: 100 },
      { investmentTransactionId: 'investment-2', scratchedAt: new Date(), rewardAmount: 75 },
      { investmentTransactionId: 'investment-3', scratchedAt: null, rewardAmount: 50 },
    ],
    [
      { referenceTxnId: 'investment-1', amount: 500 },
      { referenceTxnId: 'investment-1', amount: 100 },
      { referenceTxnId: 'deleted-investment', amount: 25 },
      { referenceTxnId: 'deleted-investment', amount: 25 },
      { referenceTxnId: null, amount: 500 },
    ],
  );

  assert.equal(total, 200);
});