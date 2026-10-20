import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getErrorMessage } from '../utils/networkErrors';

const RENDER_BACKEND_URL = 'https://android-backend-servers1.onrender.com';
const LOCAL_BACKEND_URL = RENDER_BACKEND_URL;
const ANDROID_EMULATOR_BACKEND_URL = RENDER_BACKEND_URL;
const BACKEND_PORT = 443;

function normalizeBackendUrl(value?: string) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/$/, '');
}

function parseHost(value?: string) {
  if (!value) return '';
  return String(value).replace(/^https?:\/\//, '').split(':')[0].trim();
}

const manifestHostUri = parseHost(Constants.manifest?.hostUri as string | undefined);
const manifestDebuggerHost = parseHost(Constants.manifest?.debuggerHost as string | undefined);
const manifestPackagerHost = parseHost(Constants.manifest?.packagerOpts?.host as string | undefined);
const expoConfigHost = parseHost(Constants.expoConfig?.hostUri as string | undefined);
const manifestBackendHost = parseHost(Constants.manifest?.extra?.backendHost as string | undefined);
const expoConfigBackendHost = parseHost(Constants.expoConfig?.extra?.backendHost as string | undefined);
const manifestBackendUrl = normalizeBackendUrl(Constants.manifest?.extra?.backendUrl as string | undefined);
const expoConfigBackendUrl = normalizeBackendUrl(Constants.expoConfig?.extra?.backendUrl as string | undefined);
const runtimeBackendUrl = normalizeBackendUrl(Constants.expoConfig?.extra?.backendUrl as string | undefined);

const isAndroidEmulator = Platform.OS === 'android' && Constants.isDevice === false;
const isAndroidDevice = Platform.OS === 'android' && Constants.isDevice === true;
const isPhysicalDevice = Constants.isDevice === true;
const packagerHost = manifestDebuggerHost || manifestHostUri || expoConfigHost || expoConfigBackendHost || '';
const packagerBackendUrl = packagerHost ? `http://${packagerHost}:${BACKEND_PORT}` : '';

const DEFAULT_BACKEND_URL = RENDER_BACKEND_URL;

const backendUrlFromConfig = runtimeBackendUrl || expoConfigBackendUrl || manifestBackendUrl;
const ignoreEmulatorHostOnDevice = isPhysicalDevice && backendUrlFromConfig && /^(localhost|127\.0\.0\.1|10\.0\.2\.2)$/i.test(parseHost(backendUrlFromConfig));
const resolvedBackendUrl = ignoreEmulatorHostOnDevice
  ? packagerBackendUrl || DEFAULT_BACKEND_URL
  : backendUrlFromConfig || packagerBackendUrl || DEFAULT_BACKEND_URL;

// Use Render as the only backend target for this app.
// This avoids any localhost/packager fallbacks that can interrupt production
// API calls on emulators, devices, or web builds.
export const API_BACKEND_CANDIDATES = [RENDER_BACKEND_URL];
export const API_BASE_URL = API_BACKEND_CANDIDATES[0] || resolvedBackendUrl;

if (typeof console !== 'undefined') {
  console.log('Resolved API_BACKEND_CANDIDATES:', API_BACKEND_CANDIDATES, 'platform:', Platform.OS, 'isAndroidDevice:', isAndroidDevice, 'packagerHost:', packagerHost);
  console.log('Using backend base URL:', API_BASE_URL);
}

async function getSessionToken() {
  return AsyncStorage.getItem('sessionToken');
}

async function request(path: string, options: RequestInit = {}) {
  // coalesce identical concurrent requests to avoid flooding backend
  const key = `${(options.method || 'GET').toString().toUpperCase()}:${path}`;
  if ((request as any)._inFlight?.has(key)) {
    return (request as any)._inFlight.get(key);
  }

  if (!(request as any)._inFlight) (request as any)._inFlight = new Map<string, Promise<any>>();

  const run = (async () => {
  const token = await getSessionToken();
  const providedHeaders = (options.headers as Record<string, string>) || {};
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...providedHeaders,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const errors: string[] = [];

  // prefer a previously successful backend host to avoid long fallback delays
  const PREFERRED_KEY = 'preferredBackend';
  let preferred: string | null = null;
  try {
    preferred = await AsyncStorage.getItem(PREFERRED_KEY);
  } catch (e) {
    // ignore
  }

  const candidates = preferred ? [preferred, ...API_BACKEND_CANDIDATES.filter((c) => c !== preferred)] : API_BACKEND_CANDIDATES;

  const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number = 7000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  // Registration creates a user, so retrying after a timeout can create the
  // account on the first attempt and then return "Email already registered".
  const isRegistrationRequest = path === '/api/register';
  const maxAttempts = isRegistrationRequest ? 1 : 2;
  const requestTimeoutMs = isRegistrationRequest ? 15000 : 7000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    for (const baseUrl of candidates) {
      try {
        if (typeof console !== 'undefined') {
          console.log(`Request attempt ${attempt} -> ${baseUrl}${path}`);
        }
        const response = await fetchWithTimeout(`${baseUrl}${path}`, {
          ...options,
          headers,
        }, requestTimeoutMs);

        let body: any = {};
        let responseText: string | null = null;
        try {
          responseText = await response.text();
          body = responseText ? JSON.parse(responseText) : {};
        } catch (parseError) {
          body = {};
        }

        if (!response.ok) {
          const message = body.error || body.message || responseText || `${response.status} ${response.statusText}`;
          throw new Error(getErrorMessage(`Request failed with status ${response.status}: ${message}`, 'Something went wrong. Please try again.'));
        }

        // store the successful baseUrl to prefer it for future requests (sticky selection)
        try {
          await AsyncStorage.setItem(PREFERRED_KEY, baseUrl);
        } catch (e) {}
        if (baseUrl !== API_BASE_URL) {
          console.warn(`Backend request succeeded using fallback host ${baseUrl}`);
        }
        return body;
      } catch (error: any) {
        const message = String(error?.message || '').toLowerCase();
        const isNetworkError = error?.name === 'AbortError' || error?.message === 'Network request failed' || error?.name === 'TypeError' || message.includes('timeout') || message.includes('abort') || message.includes('aborted');
        if (!isNetworkError) {
          console.error(`API request failed for ${baseUrl}${path}:`, error);
          throw error;
        }

        const messageToLog = `Attempt ${attempt} failed for ${baseUrl}${path}: ${error?.message || error}`;
        errors.push(messageToLog);
        console.warn(messageToLog, error);
      }
    }

    // exponential backoff between attempts (500ms, 1000ms...)
    if (attempt < maxAttempts) {
      const backoff = 500 * Math.pow(2, attempt - 1);
      if (typeof console !== 'undefined') console.log(`Waiting ${backoff}ms before retrying request to ${path}`);
      // eslint-disable-next-line no-await-in-loop
      await sleep(backoff);
    }
  }

  const combinedMessage = `${errors.join(' ')} Tried hosts: ${API_BACKEND_CANDIDATES.join(', ')}.`;
  throw new Error('Unable to connect to the service right now. Please check your internet connection and try again.');
  })();

  (request as any)._inFlight.set(key, run);
  try {
    const res = await run;
    return res;
  } finally {
    (request as any)._inFlight.delete(key);
  }
}

export async function checkHealth() {
  return request('/api/health');
}

export async function login(identifier: string, password: string) {
  return request('/api/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
}

export async function verifyTwoFactor(email: string, code: string) {
  return request('/api/2fa/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
}

export async function setupTwoFactor() {
  return request('/api/2fa/setup', {
    method: 'POST',
  });
}

export async function enableTwoFactor(code: string) {
  return request('/api/2fa/enable', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function disableTwoFactor() {
  return request('/api/2fa/disable', {
    method: 'POST',
  });
}

export async function sendSignupOtp(email: string) {
  return request('/api/register/send-otp', {
    method: 'POST',
    body: JSON.stringify({ email, purpose: 'signup' }),
  });
}

export async function verifySignupOtp(email: string, otp: string) {
  return request('/api/register/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp, purpose: 'signup' }),
  });
}

export async function sendPasswordResetOtp(email: string) {
  return request('/api/register/send-otp', {
    method: 'POST',
    body: JSON.stringify({ email, purpose: 'password_reset' }),
  });
}

export async function verifyPasswordResetOtp(email: string, otp: string) {
  return request('/api/register/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp, purpose: 'password_reset' }),
  });
}

export async function resetPassword(email: string, otp: string, password: string) {
  return request('/api/password-reset', {
    method: 'POST',
    body: JSON.stringify({ email, otp, password }),
  });
}

export async function claimWeeklyEarnings() {
  return request('/api/investment/claim-weekly-earnings', {
    method: 'POST',
  });
}

export async function fetchDepositSettings() {
  return request('/api/wallet/deposit-settings');
}

export async function submitDeposit(amount: number, paymentMethod: string, utrNumber?: string, proof?: { uri: string; type: string; name: string }) {
  if (!utrNumber || !proof) {
    throw new Error('Deposit requires UTR and proof. Please use the deposit request screen.');
  }

  const formData = new FormData();
  formData.append('amount', String(amount));
  formData.append('paymentMethod', paymentMethod);
  formData.append('utrNumber', utrNumber);
  const fileExtension = proof.name.split('.').pop()?.toLowerCase();
  const mimeType = proof.type?.startsWith('image/')
    ? proof.type
    : fileExtension === 'png'
      ? 'image/png'
      : fileExtension === 'webp'
        ? 'image/webp'
        : 'image/jpeg';
  formData.append('proof', {
    uri: proof.uri,
    type: mimeType,
    name: proof.name,
  } as any);

  return request('/api/wallet/deposit', {
    method: 'POST',
    body: formData,
  });
}

export async function deposit(amount: number, paymentMethod: string) {
  return submitDeposit(amount, paymentMethod);
}

export async function register(username: string, email: string, password: string, phoneNumber: string, referralCode?: string) {
  return request('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password, phoneNumber, referralCode }),
  });
}

export async function validateReferralCode(code: string) {
  return request(`/api/referral/validate/${encodeURIComponent(code)}`);
}

export async function generateReferralCode() {
  return request('/api/referral/generate', {
    method: 'POST',
  });
}

export async function fetchWalletBalance() {
  return request('/api/wallet/balance');
}

export async function fetchBankAccounts() {
  return request('/api/wallet/bank-accounts');
}

export async function createBankAccount(account: { holder: string; accountNumber: string; bankName: string; ifsc: string; branchName?: string }) {
  return request('/api/wallet/bank-accounts', {
    method: 'POST',
    body: JSON.stringify(account),
  });
}

export async function deleteBankAccount(accountId: string) {
  return request(`/api/wallet/bank-accounts/${encodeURIComponent(accountId)}`, {
    method: 'DELETE',
  });
}

export async function fetchUserProfile() {
  return request('/api/profile');
}

export async function fetchPortfolio() {
  return request('/api/portfolio');
}

export async function purchasePlan(payload: any) {
  const token = await getSessionToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number = 15000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const errors: string[] = [];
  for (const baseUrl of API_BACKEND_CANDIDATES) {
    try {
      const resp = await fetchWithTimeout(`${baseUrl}/api/portfolio/purchase`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      }, 15000);

      let body: any = {};
      try { body = await resp.json(); } catch (e) { body = {}; }

      if (!resp.ok) {
        // include body details when throwing so callers can read retryAfter
        const err = new Error(body.error || body.message || `${resp.status} ${resp.statusText}`) as any;
        err.status = resp.status;
        err.body = body;
        throw err;
      }

      return body;
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      const isNetworkError = err?.name === 'AbortError' || msg.includes('timeout') || msg.includes('network') || msg.includes('abort');
      if (!isNetworkError) throw err; // non-network errors (including 409 with body) bubble up
      errors.push(`Attempt failed for ${baseUrl}: ${err?.message || err}`);
    }
  }

  throw new Error(`All backend hosts failed. ${errors.join(' ')}`);
}

export async function withdraw(amount: number, paymentMethod: string, bankAccount?: { id: string; holder: string; accountNumber: string; bankName: string; ifsc: string }) {
  return request('/api/wallet/withdraw', {
    method: 'POST',
    body: JSON.stringify({ amount, paymentMethod, bankAccount }),
  });
}

export async function invest(payload: any) {
  return request('/api/wallet/invest', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
