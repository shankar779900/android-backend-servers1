const DEPOSIT_SETTINGS_TTL_MS = 20 * 60 * 1000;

function getDepositSettingsExpiresAt(updatedAt) {
  const updatedAtMs = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedAtMs)) return null;
  return new Date(updatedAtMs + DEPOSIT_SETTINGS_TTL_MS);
}

function isDepositSettingsExpired(settings, now = Date.now()) {
  if (!settings || !settings.updatedAt) return false;
  const expiresAt = getDepositSettingsExpiresAt(settings.updatedAt);
  return Boolean(expiresAt && now >= expiresAt.getTime());
}

function getDepositSettingsExpiryFields() {
  return {
    upiId: null,
    upiAccountHolder: null,
    bankAccountHolder: null,
    bankAccountNumber: null,
    bankIfsc: null,
    bankName: null,
    bankBranch: null,
    instructions: null,
    qrCodePath: null,
  };
}

module.exports = {
  DEPOSIT_SETTINGS_TTL_MS,
  getDepositSettingsExpiresAt,
  getDepositSettingsExpiryFields,
  isDepositSettingsExpired,
};