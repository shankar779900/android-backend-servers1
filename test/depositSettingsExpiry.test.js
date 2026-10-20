const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEPOSIT_SETTINGS_TTL_MS,
  getDepositSettingsExpiresAt,
  getDepositSettingsExpiryFields,
  isDepositSettingsExpired,
} = require('../services/depositSettingsExpiry');

test('deposit settings stay active for 20 minutes and expire at the deadline', () => {
  const updatedAt = new Date('2026-10-12T12:00:00.000Z');
  const settings = { updatedAt };

  assert.equal(getDepositSettingsExpiresAt(updatedAt).toISOString(), '2026-10-12T12:20:00.000Z');
  assert.equal(isDepositSettingsExpired(settings, updatedAt.getTime() + DEPOSIT_SETTINGS_TTL_MS - 1), false);
  assert.equal(isDepositSettingsExpired(settings, updatedAt.getTime() + DEPOSIT_SETTINGS_TTL_MS), true);
});

test('expired settings can clear every admin-provided payment field', () => {
  assert.deepEqual(getDepositSettingsExpiryFields(), {
    upiId: null,
    upiAccountHolder: null,
    bankAccountHolder: null,
    bankAccountNumber: null,
    bankIfsc: null,
    bankName: null,
    bankBranch: null,
    instructions: null,
    qrCodePath: null,
  });
});