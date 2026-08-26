function shouldAllowExistingUserOtp(purpose) {
  return purpose === 'password_reset';
}

function validateOtpSendRequest({ email, purpose, existingUser }) {
  if (!email) {
    return { ok: false, status: 400, message: 'Email is required' };
  }

  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { ok: false, status: 400, message: 'Invalid email format' };
  }

  const normalizedPurpose = purpose === 'password_reset' ? 'password_reset' : 'signup';

  if (normalizedPurpose === 'signup' && existingUser) {
    return { ok: false, status: 409, message: 'Email already registered' };
  }

  if (normalizedPurpose === 'password_reset' && !existingUser) {
    return { ok: false, status: 404, message: 'User not found' };
  }

  return { ok: true, status: 200, purpose: normalizedPurpose };
}

module.exports = {
  shouldAllowExistingUserOtp,
  validateOtpSendRequest,
};
