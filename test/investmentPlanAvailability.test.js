const test = require('node:test');
const assert = require('node:assert/strict');

const { getAllowedPlanAmounts } = require('../utils/investmentPlanAvailability');

test('equity plans include the configured amounts below ₹5,000', () => {
  const amounts = getAllowedPlanAmounts('equity');

  assert.ok(amounts.includes(2000));
  assert.ok(amounts.includes(3500));
});

test('F&O plans include the configured amounts below ₹5,000', () => {
  for (const planType of ['fno', 'futures', 'options']) {
    const amounts = getAllowedPlanAmounts(planType);
    assert.ok(amounts.includes(2000), `${planType} should allow ₹2,000`);
    assert.ok(amounts.includes(3500), `${planType} should allow ₹3,500`);
  }
});

test('existing supported amounts remain available', () => {
  assert.ok(getAllowedPlanAmounts('equity').includes(5000));
  assert.deepEqual(getAllowedPlanAmounts('commodities'), [10000, 15000, 25000]);
});
