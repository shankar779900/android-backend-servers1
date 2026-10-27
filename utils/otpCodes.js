const { createHash, randomInt } = require('crypto');

const SIX_DIGIT_PURPOSES = new Set(['login']);

function generateOtp(purpose = 'signup') {
  const digits = SIX_DIGIT_PURPOSES.has(purpose) || String(purpose).startsWith('bank_add_') ? 6 : 4;
  const minimum = 10 ** (digits - 1);
  return String(randomInt(minimum, 10 ** digits));
}

function bankAddOtpPurpose(userId, accountNumber) {
  const accountHash = createHash('sha256').update(String(accountNumber)).digest('hex').slice(0, 24);
  return `bank_add_${String(userId)}_${accountHash}`;
}

module.exports = { bankAddOtpPurpose, generateOtp };
