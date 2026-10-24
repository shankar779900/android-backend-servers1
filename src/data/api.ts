import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const API_BASE_URL = 'https://android-backend-servers1.onrender.com';
export const API_BACKEND_CANDIDATES = [API_BASE_URL];

async function request(path: string, options: RequestInit = {}) {
  const token = await AsyncStorage.getItem('sessionToken');
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...((options.headers || {}) as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error('Unable to connect to the service. Check your internet connection and try again.');
  }

  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    const error: any = new Error(data.error || data.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.body = data;
    throw error;
  }
  return data;
}

export async function checkHealth() { return request('/api/health'); }
export async function login(identifier: string, password: string) {
  return request('/api/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
}
export async function verifyTwoFactor(email: string, code: string) {
  return request('/api/2fa/verify', { method: 'POST', body: JSON.stringify({ email, code }) });
}
export async function setupTwoFactor() { return request('/api/2fa/setup', { method: 'POST' }); }
export async function enableTwoFactor(code: string) {
  return request('/api/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) });
}
export async function disableTwoFactor() { return request('/api/2fa/disable', { method: 'POST' }); }
export async function sendSignupOtp(email: string) {
  return request('/api/register/send-otp', { method: 'POST', body: JSON.stringify({ email, purpose: 'signup' }) });
}
export async function verifySignupOtp(email: string, otp: string) {
  return request('/api/register/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp, purpose: 'signup' }) });
}
export async function sendPasswordResetOtp(email: string) {
  return request('/api/register/send-otp', { method: 'POST', body: JSON.stringify({ email, purpose: 'password_reset' }) });
}
export async function verifyPasswordResetOtp(email: string, otp: string) {
  return request('/api/register/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp, purpose: 'password_reset' }) });
}
export async function resetPassword(email: string, otp: string, password: string) {
  return request('/api/password-reset', { method: 'POST', body: JSON.stringify({ email, otp, password }) });
}
export async function claimWeeklyEarnings() {
  return request('/api/investment/claim-weekly-earnings', { method: 'POST' });
}
export async function fetchDepositSettings() { return request('/api/wallet/deposit-settings'); }
export async function submitDeposit(amount: number, paymentMethod: string, utrNumber?: string, proof?: { uri: string; type: string; name: string }) {
  if (!utrNumber || !proof) throw new Error('Deposit requires a UTR number and proof image.');
  const formData = new FormData();
  formData.append('amount', String(amount));
  formData.append('paymentMethod', paymentMethod);
  formData.append('utrNumber', utrNumber);
  const ext = proof.name.split('.').pop()?.toLowerCase();
  const type = proof.type?.startsWith('image/') ? proof.type : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  if (Platform.OS === 'web') {
    const imageResponse = await fetch(proof.uri);
    const imageBlob = await imageResponse.blob();
    formData.append('proof', imageBlob, proof.name);
  } else {
    formData.append('proof', { uri: proof.uri, type, name: proof.name } as any);
  }
  return request('/api/wallet/deposit', { method: 'POST', body: formData });
}
export async function deposit(amount: number, paymentMethod: string) { return submitDeposit(amount, paymentMethod); }
export async function register(username: string, email: string, password: string, phoneNumber: string, referralCode?: string) {
  return request('/api/register', { method: 'POST', body: JSON.stringify({ username, email, password, phoneNumber, referralCode }) });
}
export async function validateReferralCode(code: string) {
  return request(`/api/referral/validate/${encodeURIComponent(code)}`);
}
export async function generateReferralCode() { return request('/api/referral/generate', { method: 'POST' }); }
export async function fetchWalletBalance() { return request('/api/wallet/balance'); }
export async function fetchBankAccounts() { return request('/api/wallet/bank-accounts'); }
export async function createBankAccount(account: { holder: string; accountNumber: string; bankName: string; ifsc: string; branchName?: string }) {
  return request('/api/wallet/bank-accounts', { method: 'POST', body: JSON.stringify(account) });
}
export async function deleteBankAccount(accountId: string) {
  return request(`/api/wallet/bank-accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
}
export async function fetchUserProfile() { return request('/api/profile'); }
export async function fetchPortfolio() { return request('/api/portfolio'); }
export async function purchasePlan(payload: any) {
  return request('/api/portfolio/purchase', { method: 'POST', body: JSON.stringify(payload) });
}
export async function withdraw(amount: number, paymentMethod: string, bankAccount?: { id: string; holder: string; accountNumber: string; bankName: string; ifsc: string }) {
  return request('/api/wallet/withdraw', { method: 'POST', body: JSON.stringify({ amount, paymentMethod, bankAccount }) });
}
export async function invest(payload: any) {
  return request('/api/wallet/invest', { method: 'POST', body: JSON.stringify(payload) });
}