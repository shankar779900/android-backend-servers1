const test = require('node:test');
const assert = require('node:assert/strict');

const { bankAddOtpPurpose, generateOtp } = require('../utils/otpCodes');

test('login and bank-add OTPs are six digits and generated as strings', () => {
  for (const purpose of ['login', bankAddOtpPurpose('user-1', '1234567890')]) {
    const otp = generateOtp(purpose);
    assert.match(otp, /^\d{6}$/);
  }
});

test('signup and password reset retain four-digit OTPs', () => {
  for (const purpose of ['signup', 'password_reset']) {
    assert.match(generateOtp(purpose), /^\d{4}$/);
  }
});

test('bank-add OTP purpose is scoped to the user and account number', () => {
  const purpose = bankAddOtpPurpose('user-1', '1234567890');
  assert.equal(purpose, bankAddOtpPurpose('user-1', '1234567890'));
  assert.notEqual(purpose, bankAddOtpPurpose('user-2', '1234567890'));
  assert.notEqual(purpose, bankAddOtpPurpose('user-1', '0987654321'));
  assert.match(purpose, /^bank_add_user-1_[a-f0-9]{24}$/);
});
