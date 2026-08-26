const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldAllowExistingUserOtp, validateOtpSendRequest } = require('../utils/otpFlow');

test('signup OTP is rejected for existing registered email', () => {
  const result = validateOtpSendRequest({
    email: 'user@example.com',
    purpose: 'signup',
    existingUser: { id: '1' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.match(result.message, /already registered/i);
});

test('password reset OTP is allowed for an existing registered user', () => {
  const result = validateOtpSendRequest({
    email: 'user@example.com',
    purpose: 'password_reset',
    existingUser: { id: '1' },
  });

  assert.equal(result.ok, true);
});

test('reset passwords are only sent for registered users', () => {
  const result = validateOtpSendRequest({
    email: 'missing@example.com',
    purpose: 'password_reset',
    existingUser: null,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
});

test('existing-user permission is purpose-based', () => {
  assert.equal(shouldAllowExistingUserOtp('signup'), false);
  assert.equal(shouldAllowExistingUserOtp('password_reset'), true);
});
