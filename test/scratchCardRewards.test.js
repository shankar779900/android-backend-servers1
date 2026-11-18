const test = require('node:test');
const assert = require('node:assert/strict');
const { getScratchCardRewardRange, generateScratchCardReward } = require('../services/scratchCardRewards');

test('scratch-card reward ranges follow the investment tiers', () => {
  assert.deepEqual(getScratchCardRewardRange(4999), { min: 1, max: 100 });
  assert.deepEqual(getScratchCardRewardRange(5000), { min: 100, max: 300 });
  assert.deepEqual(getScratchCardRewardRange(20000), { min: 100, max: 300 });
  assert.deepEqual(getScratchCardRewardRange(20001), { min: 300, max: 500 });
  assert.deepEqual(getScratchCardRewardRange(100000), { min: 300, max: 500 });
  assert.deepEqual(getScratchCardRewardRange(100001), { min: 500, max: 1000 });
});

test('scratch-card amounts are random integer values within the assigned tier', () => {
  for (const [investmentAmount, min, max] of [
    [1000, 1, 100],
    [5000, 100, 300],
    [25000, 300, 500],
    [150000, 500, 1000],
  ]) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const reward = generateScratchCardReward(investmentAmount);
      assert.equal(Number.isInteger(reward), true);
      assert.ok(reward >= min && reward <= max);
    }
  }
  assert.equal(generateScratchCardReward(0), null);
});