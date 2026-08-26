const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeReferralCode,
  generateReferralCodeForUser,
  calculateReferralBonus,
} = require('../services/referralProgram');

test('normalizeReferralCode uppercases and removes separators', () => {
  assert.equal(normalizeReferralCode(' ab-12c '), 'AB12C');
});

test('generateReferralCodeForUser creates a stable uppercase format', () => {
  const code = generateReferralCodeForUser('Jane Doe', '123456');
  assert.equal(code.length >= 8, true);
  assert.match(code, /^[A-Z0-9]+$/);
  assert.equal(code.startsWith('JANE'), true);
  assert.equal(code.slice(0, 4), 'JANE');
  assert.equal(code.slice(-6), '123456');
});

test('calculateReferralBonus applies the fixed first-purchase referral payouts', () => {
  assert.equal(calculateReferralBonus(5000), 500);
  assert.equal(calculateReferralBonus(20000), 500);
  assert.equal(calculateReferralBonus(20001), 1000);
  assert.equal(calculateReferralBonus(4999), 0);
});
