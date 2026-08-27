const path = require('path');
const dotenvPath = path.resolve(__dirname, '.env.local');
require('dotenv').config({ path: dotenvPath });
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const multer = require('multer');
const { prisma } = require('./prisma');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const axios = require('axios');
const IORedis = require('ioredis');
const { authenticator } = require('otplib');
const { getPortfolioSummaryForUser, claimPendingWeekEarnings, processDailyInvestmentEarnings } = require('./services/investmentEarnings');
const { buildPendingDepositTransactionData } = require('./services/depositVerification');
const { validateOtpSendRequest, shouldAllowExistingUserOtp } = require('./utils/otpFlow');
const {
  normalizeReferralCode,
  generateReferralCodeForUser,
  awardReferralBonusForReferrer,
} = require('./services/referralProgram');
const cron = require('node-cron');

const REDIS_URL = process.env.REDIS_URL || process.env.REDIS || null;
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || null;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || null;

const hasRedis = Boolean(REDIS_URL);
const hasUpstashRest = Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);
let redisClient = null;

function createUpstashRedisClient(baseUrl, token) {
  const client = axios.create({
    baseURL: baseUrl,
    timeout: 10000,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  async function execute(command) {
    const response = await client.post('', command);
    if (response.data?.error) {
      throw new Error(response.data.error);
    }
    return response.data?.result;
  }

  return {
    get: async (key) => execute(['get', key]),
    set: async (key, value, mode, ttl) => {
      const command = mode === 'EX' ? ['set', key, value, 'EX', String(ttl)] : ['set', key, value];
      return execute(command);
    },
    del: async (...keys) => execute(['del', ...keys]),
  };
}

if (hasRedis) {
  redisClient = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: 2,
    connectTimeout: 10000,
  });
} else if (hasUpstashRest) {
  redisClient = createUpstashRedisClient(UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN);
}

const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 30);

if (redisClient) {
  if (hasRedis) {
    redisClient.on('connect', () => {
      console.log(`Redis cache connected: ${REDIS_URL}`);
    });
    redisClient.on('error', (err) => {
      console.warn('[Redis] connection error', err?.message || err);
    });
  } else {
    console.log('Redis cache configured via Upstash REST API');
  }
} else {
  console.log('Redis cache disabled: no REDIS_URL or UPSTASH_REDIS_REST_URL configured');
}

// If we have a standard Redis configured, preload user balances and F&O cooldown keys
async function preloadRedisState() {
  if (!hasRedis || !redisClient) return;
  try {
    console.log('[startup] preloading user balances into Redis');
    const users = await prisma.user.findMany({ select: { id: true, balance: true } });
    const pipeline = redisClient.pipeline();
    for (const u of users) {
      pipeline.set(`wallet:balance:${u.id}`, String(Math.max(0, Math.floor(Number(u.balance || 0)))), 'EX', 60 * 60 * 24 * 7); // 7 days
    }
    await pipeline.exec();
    console.log('[startup] preloaded balances into Redis for', users.length, 'users');
  } catch (err) {
    console.warn('[startup] failed to preload Redis state', err?.message || err);
  }
}

preloadRedisState().catch(() => {});

// Schedule daily earnings processing at 16:05 IST (run after market close)
try {
  cron.schedule('5 16 * * *', async () => {
    try {
      console.log('[cron] running daily earnings processor (16:05 IST)');
      await processDailyInvestmentEarnings();
      console.log('[cron] daily earnings processor finished');
    } catch (e) {
      console.error('[cron] daily earnings processor failed', e?.stack || e);
    }
  }, { timezone: 'Asia/Kolkata' });
  console.log('[cron] scheduled daily earnings processor at 16:05 IST');
} catch (e) {
  console.warn('[cron] failed to schedule daily earnings processor', e?.message || e);
}

async function cacheGet(key) {
  if (!redisClient) return null;
  // Do not allow slow/unreachable Redis to block API responses.
  if (!redisClient) return null;
  const getPromise = (async () => {
    try {
      const raw = await redisClient.get(key);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        // support legacy values where payload was stored directly
        if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'payload')) {
          return parsed.payload;
        }
        return parsed;
      } catch (e) {
        return raw;
      }
    } catch (err) {
      console.warn('[cacheGet] failed', err?.message || err);
      return null;
    }
  })();

  // If cache doesn't respond quickly, fall back to DB (avoid long waits)
  const timeoutMs = 300; // short timeout for reads
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([getPromise, timeout]);
}

async function cacheSet(key, value, ttl = CACHE_TTL_SECONDS) {
  if (!redisClient) return;
  // avoid double-wrapping when caller already provided a wrapper
  let payload;
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'payload') && Object.prototype.hasOwnProperty.call(value, 'lastUpdated')) {
    payload = JSON.stringify(value);
  } else {
    const wrapper = { payload: value, lastUpdated: Date.now() };
    payload = JSON.stringify(wrapper);
  }

  // Try to set quickly; don't block the request path on slow Redis.
  const setOp = (async () => {
    try {
      await redisClient.set(key, payload, 'EX', Math.max(1, ttl));
    } catch (err) {
      throw err;
    }
  })();

  const timeoutMs = 300; // short timeout to avoid long waits
  const timeout = new Promise((resolve) => setTimeout(() => resolve('__CACHE_TIMEOUT__'), timeoutMs));
  const res = await Promise.race([setOp.then(() => 'ok').catch((e) => { throw e; }), timeout]);
  if (res === '__CACHE_TIMEOUT__') {
    console.warn('[cacheSet] timeout, scheduling background retry for', key);
    // Schedule background retries without blocking response
    (function scheduleRetries(attempt = 0) {
      const delays = [1000, 2000, 4000];
      setTimeout(async () => {
        try {
          await redisClient.set(key, payload, 'EX', Math.max(1, ttl));
          console.log('[cacheSet] background retry succeeded for', key);
        } catch (err) {
          if (attempt + 1 < delays.length) {
            scheduleRetries(attempt + 1);
          } else {
            console.warn('[cacheSet] background retries failed for', key, err?.message || err);
          }
        }
      }, delays[Math.min(attempt, delays.length - 1)]);
    })();
  }
}

// Set only if incoming lastUpdated is newer than existing cache entry
async function cacheSetIfNewer(key, value, ttl = CACHE_TTL_SECONDS, lastUpdated = Date.now()) {
  if (!redisClient) return;
  try {
    const raw = await cacheGetRaw(key, 300);
    if (raw && raw.lastUpdated && raw.lastUpdated > lastUpdated) {
      // existing cache is newer; skip
      return;
    }
  } catch (e) {
    // ignore read errors and proceed to set
  }
  const wrapper = { payload: value, lastUpdated };
  await cacheSet(key, wrapper, ttl);
}

// Helper to read raw wrapper (payload + metadata) with timeout
async function cacheGetRaw(key, timeoutMs = 300) {
  if (!redisClient) return null;
  const getPromise = (async () => {
    try {
      const raw = await redisClient.get(key);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    } catch (err) {
      return null;
    }
  })();
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([getPromise, timeout]);
}

async function cacheDel(...keys) {
  if (!redisClient || keys.length === 0) return;

  const delOp = (async () => {
    try {
      await redisClient.del(...keys);
    } catch (err) {
      throw err;
    }
  })();

  const timeoutMs = 300;
  const timeout = new Promise((resolve) => setTimeout(() => resolve('__CACHE_TIMEOUT__'), timeoutMs));
  const res = await Promise.race([delOp.then(() => 'ok').catch((e) => { throw e; }), timeout]);
  if (res === '__CACHE_TIMEOUT__') {
    console.warn('[cacheDel] timeout, scheduling background retry for', keys);
    (function scheduleRetries(attempt = 0) {
      const delays = [1000, 2000, 4000];
      setTimeout(async () => {
        try {
          await redisClient.del(...keys);
          console.log('[cacheDel] background retry succeeded for', keys);
        } catch (err) {
          if (attempt + 1 < delays.length) {
            scheduleRetries(attempt + 1);
          } else {
            console.warn('[cacheDel] background retries failed for', keys, err?.message || err);
          }
        }
      }, delays[Math.min(attempt, delays.length - 1)]);
    })();
  }
}

function profileCacheKey(userId) {
  return `profile:${userId}`;
}

function walletBalanceCacheKey(userId) {
  return `wallet:balance:${userId}`;
}

function walletTransactionsCacheKey(userId) {
  return `wallet:transactions:${userId}`;
}

function bankAccountsCacheKey(userId) {
  return `bankAccounts:${userId}`;
}

function portfolioCacheKey(userId) {
  return `portfolio:${userId}`;
}

function invalidateUserCache(userId) {
  return cacheDel(
    profileCacheKey(userId),
    walletBalanceCacheKey(userId),
    walletTransactionsCacheKey(userId),
    bankAccountsCacheKey(userId),
    portfolioCacheKey(userId)
  );
}

async function cacheUserProfile(user) {
  if (!user) return;
  const key = profileCacheKey(user.id);
  const payload = {
    user: {
      username: user.username,
      email: user.email,
      phoneNumber: user.phoneNumber,
      balance: user.balance,
    },
  };
  await cacheSetIfNewer(key, payload, CACHE_TTL_SECONDS, Date.now()).catch(() => {});
}

async function cacheUserWalletBalance(user) {
  if (!user) return;
  await cacheSetIfNewer(walletBalanceCacheKey(user.id), { balance: user.balance }, CACHE_TTL_SECONDS, Date.now()).catch(() => {});
}

async function cacheUserWalletTransactions(userId, transactions) {
  if (!userId || !Array.isArray(transactions)) return;
  await cacheSetIfNewer(walletTransactionsCacheKey(userId), transactions, CACHE_TTL_SECONDS, Date.now()).catch(() => {});
}

async function cacheUserBankAccounts(userId, accounts) {
  if (!userId || !Array.isArray(accounts)) return;
  await cacheSetIfNewer(bankAccountsCacheKey(userId), accounts, CACHE_TTL_SECONDS, Date.now()).catch(() => {});
}

async function cacheUserPortfolio(userId, response) {
  if (!response) return;
  await cacheSetIfNewer(portfolioCacheKey(userId), response, CACHE_TTL_SECONDS, Date.now()).catch(() => {});
}

async function getWalletBalance(userId) {
  if (!userId) return 0;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { balance: true } });
  return Number(user?.balance || 0);
}

async function findOrCreateBankAccount(userId, bankAccount) {
  if (!userId || !bankAccount || !bankAccount.accountNumber) return null;

  const accountNumber = String(bankAccount.accountNumber).trim();
  const existing = bankAccount.id
    ? await prisma.bankAccount.findFirst({ where: { id: bankAccount.id, userId } })
    : await prisma.bankAccount.findFirst({ where: { userId, accountNumber } });

  if (existing) {
    return existing.id;
  }

  const newAccount = await prisma.bankAccount.create({
    data: {
      id: createId(),
      userId,
      accountHolderName: String(bankAccount.holder || bankAccount.accountHolderName || 'Unknown').trim(),
      accountNumber,
      ifscCode: String(bankAccount.ifsc || bankAccount.ifscCode || '').trim(),
      bankName: String(bankAccount.bankName || '').trim(),
      branchName: String(bankAccount.branchName || '').trim(),
      isVerified: false,
    },
  });

  return newAccount.id;
}

const app = express();
const port = process.env.PORT || 4000;
const rawEmailUser = (process.env.EMAIL_USER || process.env.SMTP_USER || process.env.ADMIN_EMAIL || '').trim();
const rawEmailPass = (process.env.EMAIL_PASS || process.env.SMTP_PASS || process.env.APP_PASSWORD || '').replace(/\s+/g, '').trim();
const EMAIL_USER = rawEmailUser;
const EMAIL_PASS = rawEmailPass;
const EMAIL_FROM = (process.env.EMAIL_FROM || EMAIL_USER).trim();

if (process.env.EMAIL_PASS && rawEmailPass !== process.env.EMAIL_PASS) {
  console.warn('EMAIL_PASS contained whitespace and was normalized for SMTP auth.');
}

const OTP_EXPIRY_MINUTES = 5;
const OTP_RESEND_DELAY_SECONDS = 60;
const OTP_MAX_VERIFY_ATTEMPTS = 5;

app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());

// Ensure uploads directory exists and serve it statically
const uploadsDir = path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
} catch (e) {
  console.warn('[uploads] could not ensure uploads directory', e?.message || e);
}
app.use('/uploads', express.static(uploadsDir));

// Multer config for handling admin file uploads (QR code)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safe = String(Date.now()) + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '_');
    cb(null, safe);
  },
});
const upload = multer({ storage });

// Serve the admin static UI at /admin
const adminStaticPath = path.join(__dirname, 'admin');
app.use('/admin', express.static(adminStaticPath));
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(adminStaticPath, 'index.html'));
});

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function generateUniqueAdminSecretKey() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = createToken();
    const existing = await prisma.admin.findUnique({ where: { secretKey: candidate } });
    if (!existing) return candidate;
  }
  return `${createToken()}-${Date.now()}`;
}

function createId() {
  return crypto.randomBytes(16).toString('hex');
}

function generateOTP() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function canSendOTP(email, purpose = 'signup') {
  const lastOtp = await prisma.oTP.findFirst({
    where: { email, purpose },
    orderBy: { createdAt: 'desc' },
  });

  if (!lastOtp) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const ageSeconds = Math.floor((Date.now() - new Date(lastOtp.createdAt).getTime()) / 1000);
  if (ageSeconds < OTP_RESEND_DELAY_SECONDS) {
    return {
      allowed: false,
      retryAfterSeconds: OTP_RESEND_DELAY_SECONDS - ageSeconds,
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

async function createOtpRecord(email, purpose = 'signup') {
  const otp = generateOTP();
  const hashedOtp = await bcrypt.hash(otp, 10);

  await prisma.oTP.deleteMany({ where: { email, purpose } });
  await prisma.oTP.create({
    data: {
      id: createId(),
      email,
      otp: hashedOtp,
      purpose,
      attempts: 0,
      verified: false,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
    },
  });

  return otp;
}

async function sendEmailOTP(email, purpose = 'signup') {
  const otp = await createOtpRecord(email, purpose);
  const emailConfigured = Boolean(EMAIL_USER && EMAIL_PASS);

  if (!emailConfigured) {
    console.log(`[signup-otp] Email sender is not configured. OTP for ${email}: ${otp}`);
    throw new Error('Email sender is not configured. Set EMAIL_USER and EMAIL_PASS to send OTP via admin mail.');
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: EMAIL_FROM,
    to: email,
    subject: 'Your signup verification code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Upward Investments</h2>
        <p>Hello,</p>
        <p>Your signup verification code is:</p>
        <div style="background-color: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 28px; font-weight: bold; color: #7c3aed; letter-spacing: 4px;">${otp}</span>
        </div>
        <p>This code expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
        <p>If you did not request this code, please ignore this email.</p>
        <br />
        <p>Best regards,<br />Upward Investments Team</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ OTP email sent to ${email}`);
    return otp;
  } catch (error) {
    console.error('[signup-otp] Failed to send OTP email:', error);
    console.log(`[signup-otp] Falling back to logged OTP for ${email}: ${otp}`);
    return otp;
  }
}

async function verifyOTP(email, otp, purpose = 'signup') {
  const otpRecord = await prisma.oTP.findFirst({
    where: {
      email,
      purpose,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!otpRecord) {
    return false;
  }

  const isValid = await bcrypt.compare(otp, otpRecord.otp);
  if (!isValid) {
    const attempts = (otpRecord.attempts ?? 0) + 1;
    if (attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      await prisma.oTP.delete({ where: { id: otpRecord.id } });
    } else {
      await prisma.oTP.update({ where: { id: otpRecord.id }, data: { attempts } });
    }
    return false;
  }

  await prisma.oTP.update({ where: { id: otpRecord.id }, data: { verified: true } });
  return true;
}

function parseDurationDays(label) {
  if (!label) return 30;
  const normalized = String(label).trim().toLowerCase();
  if (normalized.includes('month')) return 22;
  const match = normalized.match(/(\d+)\s*days?/i);
  if (match) return Number(match[1]);
  const weekMatch = normalized.match(/(\d+)\s*weeks?/i);
  if (weekMatch) return Number(weekMatch[1]) * 5;
  return 30;
}

function determineWorkingDays(durationLabel, planType) {
  const normalized = String(durationLabel || '').trim().toLowerCase();
  if (normalized.includes('month')) return 22;
  const daysMatch = normalized.match(/(\d+)\s*days?/i);
  if (daysMatch) return Number(daysMatch[1]);
  const weeksMatch = normalized.match(/(\d+)\s*weeks?/i);
  if (weeksMatch) return Number(weeksMatch[1]) * 5;
  if (planType === 'fno' || planType === 'futures' || planType === 'options') return 5;
  if (planType === 'equity') return 22;
  return 22;
}

function buildPortfolioPlan(transaction, todayGain = 0) {
  let details = {};
  try {
    if (transaction.investmentDetails) {
      details = typeof transaction.investmentDetails === 'string' 
        ? JSON.parse(transaction.investmentDetails) 
        : transaction.investmentDetails;
    }
  } catch {
    details = {};
  }

  const purchasedAt = transaction.createdAt instanceof Date ? transaction.createdAt : new Date(transaction.createdAt);
  const durationDays = Math.max(parseDurationDays(transaction.investmentDuration || details.durationLabel || '30 Days'), 1);
  const expiresAt = new Date(purchasedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const amount = Number(transaction.amount || 0);
  const expectedReturn = Number(transaction.expectedReturn || details.expectedReturn || 0);
  const derivedReturnPercent = Number(transaction.returnPercent ?? details.returnPercent ?? (amount && expectedReturn ? ((expectedReturn - amount) / amount) * 100 : 0));
  const totalProfit = Number(transaction.totalProfit ?? details.totalProfit ?? (expectedReturn ? Math.max(expectedReturn - amount, 0) : 0));
  const workingDays = Number(transaction.workingDays || details.workingDays || determineWorkingDays(transaction.investmentDuration || details.durationLabel || '30 Days', details.planType || 'equity'));
  const dailyProfit = Number(transaction.dailyProfit ?? details.dailyProfit ?? (workingDays ? totalProfit / workingDays : 0));

  return {
    id: transaction.investmentPlanId || transaction.id,
    planName: transaction.investmentName || details.planName || 'Investment Plan',
    planType: details.planType || 'equity',
    amount,
    amountLabel: details.amountLabel || `₹${Number(transaction.amount || 0).toLocaleString('en-IN')}`,
    returnLabel: details.returnLabel || 'Up to 0%',
    returnPercent: derivedReturnPercent,
    durationLabel: transaction.investmentDuration || details.durationLabel || '30 Days',
    totalReturn: expectedReturn || amount + totalProfit,
    totalProfit,
    dailyProfit,
    premium: Boolean(details.premium),
    quantity: 1,
    purchasedAt: purchasedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    workingDays,
    creditedEarnings: Number(transaction.creditedEarnings || 0),
    todayGain: Number(todayGain || 0),
    portfolioEarnings: Number(transaction.creditedEarnings || 0),
    investmentStatus: transaction.investmentStatus,
    transactionId: transaction.transactionId,
  };
}

function getAuthToken(req) {
  const bearer = req.headers.authorization?.toString();
  if (bearer?.startsWith('Bearer ')) {
    return bearer.slice(7).trim();
  }
  const cookieHeader = req.headers.cookie?.toString();
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|; )session=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

async function getSessionFromRequest(req) {
  const token = getAuthToken(req);
  if (!token) return null;
  try {
    const session = await prisma.session.findUnique({ where: { token } });
    if (!session || session.expiresAt < new Date()) return null;
    return session;
  } catch (err) {
    console.error('[getSessionFromRequest] database error', err?.message || err);
    // If DB is temporarily unreachable, treat as no session rather than crashing
    return null;
  }
}

const TOTP_ISSUER = 'Upward Investments';

function createTwoFactorSecret() {
  return authenticator.generateSecret();
}

function createTwoFactorOtpAuthUrl(email, secret) {
  return authenticator.keyuri(email, TOTP_ISSUER, secret);
}

function verifyTwoFactorCode(code, secret) {
  if (!code || !secret) return false;
  try {
    return authenticator.check(code.trim(), secret.trim());
  } catch (err) {
    return false;
  }
}

function toIndiaMidnight(date) {
  const local = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  local.setHours(0, 0, 0, 0);
  return local;
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// --- Admin endpoints (used by the admin UI served at /admin) ---
app.post('/api/admin/signup', async (req, res) => {
  const { username, password, creationKey } = req.body || {};
  if (!username || !password || !creationKey) return res.status(400).json({ error: 'username, password and creationKey are required' });

  const masterKey = (process.env.ADMIN_CREATION_KEY || '').trim();
  if (!masterKey) return res.status(500).json({ error: 'Server admin creation key is not configured' });
  if (String(creationKey).trim() !== masterKey) return res.status(403).json({ error: 'Invalid admin creation key' });

  const existing = await prisma.admin.findUnique({ where: { username } });
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const hashed = await bcrypt.hash(password, 10);
  const secretKey = await generateUniqueAdminSecretKey();
  const admin = await prisma.admin.create({ data: { id: createId(), username, password: hashed, secretKey } });

  return res.json({ message: 'Admin created', adminId: admin.id, secretKey });
});

app.post('/api/admin/password-reset', async (req, res) => {
  const { username, password, secretKey } = req.body || {};
  if (!username || !password || !secretKey) return res.status(400).json({ error: 'username, password and secretKey are required' });

  const admin = await prisma.admin.findUnique({ where: { username } });
  if (!admin) return res.status(404).json({ error: 'Admin not found' });

  // allow either the admin's secretKey or the master ADMIN_CREATION_KEY to reset
  const masterKey = (process.env.ADMIN_CREATION_KEY || '').trim();
  if (secretKey !== admin.secretKey && secretKey !== masterKey) return res.status(403).json({ error: 'Invalid secret key' });

  const hashed = await bcrypt.hash(password, 10);
  await prisma.admin.update({ where: { id: admin.id }, data: { password: hashed } });
  return res.json({ message: 'Password updated' });
});

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });

  const admin = await prisma.admin.findUnique({ where: { username } });
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, admin.password);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  if (admin.twoFactorEnabled) {
    return res.json({ requires2fa: true, adminId: admin.id });
  }

  const token = createToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { id: createId(), email: admin.username, token, userId: null, expiresAt, updatedAt: new Date() } });

  return res.json({ token, admin: { id: admin.id, username: admin.username } });
});

app.get('/api/admin/verify-session', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Invalid session' });
  const admin = await prisma.admin.findUnique({ where: { username: session.email } });
  if (!admin) return res.status(401).json({ error: 'Invalid admin session' });
  return res.json({ admin: { id: admin.id, username: admin.username } });
});

app.post('/api/admin/2fa/setup', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Missing admin token' });
  const admin = await prisma.admin.findUnique({ where: { username: session.email } });
  if (!admin) return res.status(404).json({ error: 'Admin not found' });

  const secret = createTwoFactorSecret();
  const otpauthUrl = createTwoFactorOtpAuthUrl(admin.username, secret);
  await prisma.admin.update({ where: { id: admin.id }, data: { twoFactorSecret: secret } });
  return res.json({ secret, otpauthUrl });
});

app.post('/api/admin/2fa/enable', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Missing admin token' });
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Code is required' });
  const admin = await prisma.admin.findUnique({ where: { username: session.email } });
  if (!admin || !admin.twoFactorSecret) return res.status(400).json({ error: 'Two-factor not setup' });
  if (!verifyTwoFactorCode(code, admin.twoFactorSecret)) return res.status(400).json({ error: 'Invalid code' });
  await prisma.admin.update({ where: { id: admin.id }, data: { twoFactorEnabled: true } });
  return res.json({ message: 'Two-factor enabled' });
});

app.post('/api/admin/2fa/verify', async (req, res) => {
  const { adminId, code } = req.body || {};
  if (!adminId || !code) return res.status(400).json({ error: 'adminId and code are required' });
  const admin = await prisma.admin.findUnique({ where: { id: adminId } });
  if (!admin || !admin.twoFactorSecret) return res.status(400).json({ error: 'Invalid admin or 2FA not configured' });
  if (!verifyTwoFactorCode(code, admin.twoFactorSecret)) return res.status(400).json({ error: 'Invalid code' });
  const token = createToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { id: createId(), email: admin.username, token, userId: null, expiresAt, updatedAt: new Date() } });
  return res.json({ token, admin: { id: admin.id, username: admin.username } });
});

// Admin data and management endpoints used by the admin UI
app.get('/api/admin/summary', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Missing admin token' });
  const admin = await prisma.admin.findUnique({ where: { username: session.email } });
  if (!admin) return res.status(401).json({ error: 'Invalid admin' });

  try {
    const userCount = await prisma.user.count();
    const totalBalanceRes = await prisma.user.aggregate({ _sum: { balance: true } });
    const totalBalance = Number(totalBalanceRes._sum.balance || 0);
    const totalDepositedRes = await prisma.transaction.aggregate({ where: { type: 'deposit', status: 'completed' }, _sum: { amount: true } });
    const totalWithdrawnRes = await prisma.transaction.aggregate({ where: { type: 'withdraw', status: 'completed' }, _sum: { amount: true } });
    const totalDeposited = Number(totalDepositedRes._sum.amount || 0);
    const totalWithdrawn = Number(totalWithdrawnRes._sum.amount || 0);

    // Compute portfolio total: sum of active/reinvested investments' current value.
    // Use (amount + creditedEarnings) as conservative current portfolio value.
    const investmentRows = await prisma.transaction.findMany({ where: { type: 'investment', investmentStatus: { in: ['Active', 'Reinvested'] } }, select: { amount: true, creditedEarnings: true } });
    const totalPortfolioValue = investmentRows.reduce((sum, t) => sum + Number(t.amount || 0) + Number(t.creditedEarnings || 0), 0);
    const pendingCount = await prisma.transaction.count({ where: { OR: [{ status: 'pending' }, { verificationStatus: 'pending' }] } });

    const recentPending = await prisma.transaction.findMany({ where: { OR: [{ status: 'pending' }, { verificationStatus: 'pending' }] }, orderBy: { createdAt: 'desc' }, take: 8, include: { user: true } });

    return res.json({ userCount, totalBalance, totalDeposited, totalWithdrawn, pendingCount, totalPortfolioValue, recentPending });
  } catch (err) {
    console.error('[admin/summary] error', err?.message || err);
    return res.status(500).json({ error: 'Unable to load summary' });
  }
});

app.get('/api/admin/transactions', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Missing admin token' });
  const admin = await prisma.admin.findUnique({ where: { username: session.email } });
  if (!admin) return res.status(401).json({ error: 'Invalid admin' });

  try {
    const transactions = await prisma.transaction.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { user: true } });
    return res.json({ transactions });
  } catch (err) {
    console.error('[admin/transactions] error', err?.message || err);
    return res.status(500).json({ error: 'Unable to load transactions' });
  }
});

app.get('/api/admin/users', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Missing admin token' });
  const admin = await prisma.admin.findUnique({ where: { username: session.email } });
  if (!admin) return res.status(401).json({ error: 'Invalid admin' });

  try {
    const search = (req.query.search || '').toString();
    const where = search ? { OR: [{ username: { contains: search } }, { email: { contains: search } }, { phoneNumber: { contains: search } }] } : {};
    const users = await prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    // Attach computed `portfolioValue` and `totalInvested` for each user so admin UI can show accurate values
    const usersWithPortfolio = [];
    for (const user of users) {
      try {
        // Use the server helper to aggregate plans and invested amounts (groups by plan+amount)
        const summary = await getPortfolioSummaryForUser({ userId: user.id, referenceDate: new Date() });
        const totalInvested = Number(summary.totalInvested || 0);
        const portfolioValue = (summary.plans || []).reduce((s, p) => s + Number(p.amount || 0) * (Number(p.quantity || 1)) + Number(p.creditedEarnings || 0), 0);
        usersWithPortfolio.push(Object.assign({}, user, { portfolioValue, totalInvested }));
      } catch (e) {
        usersWithPortfolio.push(Object.assign({}, user, { portfolioValue: 0, totalInvested: 0 }));
      }
    }

    return res.json({ users: usersWithPortfolio });
  } catch (err) {
    console.error('[admin/users] error', err?.message || err);
    return res.status(500).json({ error: 'Unable to load users' });
  }
});

// Admin: suspend a user
app.post('/api/admin/users/:id/suspend', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Missing admin token' });
  const admin = await prisma.admin.findUnique({ where: { username: session.email } });
  if (!admin) return res.status(401).json({ error: 'Invalid admin' });

  const userId = req.params.id;
  if (!userId) return res.status(400).json({ error: 'user id required' });

  try {
    const updated = await prisma.user.update({ where: { id: userId }, data: { isSuspended: true } });
    await invalidateUserCache(userId).catch(() => {});
    return res.json({ success: true, user: updated });
  } catch (err) {
    console.error('[admin/users/suspend] error', err?.message || err);
    return res.status(500).json({ error: 'Unable to suspend user' });
  }
});

// Admin: unsuspend a user
app.post('/api/admin/users/:id/unsuspend', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Missing admin token' });
  const admin = await prisma.admin.findUnique({ where: { username: session.email } });
  if (!admin) return res.status(401).json({ error: 'Invalid admin' });

  const userId = req.params.id;
  if (!userId) return res.status(400).json({ error: 'user id required' });

  try {
    const updated = await prisma.user.update({ where: { id: userId }, data: { isSuspended: false } });
    await invalidateUserCache(userId).catch(() => {});
    return res.json({ success: true, user: updated });
  } catch (err) {
    console.error('[admin/users/unsuspend] error', err?.message || err);
    return res.status(500).json({ error: 'Unable to unsuspend user' });
  }
});

// Admin: edit user fields
app.put('/api/admin/users/:id', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Missing admin token' });
  const admin = await prisma.admin.findUnique({ where: { username: session.email } });
  if (!admin) return res.status(401).json({ error: 'Invalid admin' });

  const userId = req.params.id;
  if (!userId) return res.status(400).json({ error: 'user id required' });

  const { username, email, phoneNumber } = req.body || {};
  const data = {};
  if (typeof username === 'string') data.username = username.trim();
  if (typeof email === 'string') data.email = email.trim();
  if (typeof phoneNumber === 'string') data.phoneNumber = phoneNumber.trim();

  try {
    const updated = await prisma.user.update({ where: { id: userId }, data });
    await invalidateUserCache(userId).catch(() => {});
    return res.json({ success: true, user: updated });
  } catch (err) {
    console.error('[admin/users/update] error', err?.message || err);
    return res.status(500).json({ error: 'Unable to update user' });
  }
});

app.get('/api/admin/pending-transactions', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Missing admin token' });
  const admin = await prisma.admin.findUnique({ where: { username: session.email } });
  if (!admin) return res.status(401).json({ error: 'Invalid admin' });

  try {
    // Exclude automatic investment transactions from admin pending approvals
    const pending = await prisma.transaction.findMany({
      where: {
        AND: [
          { OR: [{ status: 'pending' }, { verificationStatus: 'pending' }] },
          { NOT: { type: 'investment' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: true },
    });
    return res.json({ transactions: pending });
  } catch (err) {
    console.error('[admin/pending-transactions] error', err?.message || err);
    return res.status(500).json({ error: 'Unable to load pending transactions' });
  }
});

app.post('/api/admin/add-balance', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Missing admin token' });
  const admin = await prisma.admin.findUnique({ where: { username: session.email } });
  if (!admin) return res.status(401).json({ error: 'Invalid admin' });

  const { userId, amount, reason } = req.body || {};
  const numeric = Number(amount || 0);
  if (!userId || !numeric) return res.status(400).json({ error: 'userId and amount are required' });

  try {
    // Perform update and transaction creation atomically
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: userId }, data: { balance: { increment: numeric } } });
      const txn = await tx.transaction.create({
        data: {
          id: createId(),
          user: { connect: { id: userId } },
          type: 'admin_adjust',
          amount: numeric,
          status: 'completed',
          description: `Admin: ${reason || 'adjustment'}`,
          transactionId: `ADM-${Date.now()}`,
          investmentName: '',
        },
      });
      return { updated, txn };
    });

    // Warm caches asynchronously (do not fail the request if caching errors occur)
    void Promise.all([
      cacheUserProfile(result.updated).catch(() => {}),
      cacheUserWalletBalance(result.updated).catch(() => {}),
    ]).catch(() => {});

    return res.json({ message: 'Balance updated', balance: result.updated.balance, transactionId: result.txn.transactionId });
  } catch (err) {
    console.error('[admin/add-balance] error', err?.message || err);
    // Prisma common errors mapping
    if (err && err.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(500).json({ error: err?.message || 'Unable to update balance' });
  }
});

app.get('/api/admin/deposit-settings', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Missing admin token' });
  const admin = await prisma.admin.findUnique({ where: { username: session.email } });
  if (!admin) return res.status(401).json({ error: 'Invalid admin' });

  try {
    const settings = await prisma.depositSetting.findFirst({ orderBy: { createdAt: 'desc' } });
    return res.json({ settings });
  } catch (err) {
    console.error('[admin/deposit-settings] error', err?.message || err);
    return res.status(500).json({ error: 'Unable to load deposit settings' });
  }
});

app.post('/api/admin/deposit-settings', upload.single('qrFile'), async (req, res) => {
  // Note: admin UI posts multipart/form-data; rely on bodyParser not parsing this.
  // For simplicity, accept JSON body as a convenience (UI uses FormData, so this route
  // should be handled by middleware in production). We'll attempt to read fields from req.body.
  const session = await getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Missing admin token' });
  const admin = await prisma.admin.findUnique({ where: { username: session.email } });
  if (!admin) return res.status(401).json({ error: 'Invalid admin' });

    try {
      const { upiId, bankAccountHolder, bankAccountNumber, bankIfsc, bankName, bankBranch, instructions } = req.body || {};
      // If a QR file was uploaded via multer, set the public path
      let qrCodePath = null;
      if (req.file && req.file.filename) {
        qrCodePath = `/uploads/${req.file.filename}`;
      }

      const existing = await prisma.depositSetting.findFirst();
      if (existing) {
        const updated = await prisma.depositSetting.update({ where: { id: existing.id }, data: { upiId: upiId || null, bankAccountHolder: bankAccountHolder || null, bankAccountNumber: bankAccountNumber || null, bankIfsc: bankIfsc || null, bankName: bankName || null, bankBranch: bankBranch || null, instructions: instructions || null, qrCodePath: qrCodePath || existing.qrCodePath || null, updatedAt: new Date() } });
        return res.json({ settings: updated });
      }
      const created = await prisma.depositSetting.create({ data: { id: createId(), key: 'default', upiId: upiId || null, bankAccountHolder: bankAccountHolder || null, bankAccountNumber: bankAccountNumber || null, bankIfsc: bankIfsc || null, bankName: bankName || null, bankBranch: bankBranch || null, instructions: instructions || null, qrCodePath: qrCodePath || null, updatedAt: new Date() } });
      return res.json({ settings: created });
    } catch (err) {
      console.error('[admin/deposit-settings POST] error', err?.message || err);
      return res.status(500).json({ error: 'Unable to save deposit settings' });
    }
});

app.post('/api/admin/verify-transaction', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Missing admin token' });
  const admin = await prisma.admin.findUnique({ where: { username: session.email } });
  if (!admin) return res.status(401).json({ error: 'Invalid admin' });

  const { transactionId, action, notes } = req.body || {};
  if (!transactionId || !action) return res.status(400).json({ error: 'transactionId and action are required' });

  try {
    // Accept either external `transactionId` (payment gateway id) or internal `id`.
    let txn = await prisma.transaction.findUnique({ where: { transactionId } });
    if (!txn) {
      // Try treating the provided value as the internal `id` primary key.
      txn = await prisma.transaction.findUnique({ where: { id: transactionId } });
    }
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });

    if (action === 'approve') {
      if (txn.type === 'deposit') {
        if (txn.status === 'completed' && txn.verificationStatus === 'verified') {
          return res.status(409).json({ error: 'This deposit has already been approved.' });
        }

        const result = await prisma.$transaction(async (tx) => {
          const updatedTxn = await tx.transaction.update({
            where: { id: txn.id },
            data: {
              status: 'completed',
              verificationStatus: 'verified',
              verifiedBy: admin.username,
              verificationNotes: notes || 'Approved by admin',
              completedAt: new Date(),
            }
          });
          const updatedUser = await tx.user.update({ where: { id: txn.userId }, data: { balance: { increment: Number(txn.amount || 0) } } });
          return { updatedTxn, updatedUser };
        });

        void Promise.all([
          cacheUserProfile(result.updatedUser).catch(() => {}),
          cacheUserWalletBalance(result.updatedUser).catch(() => {}),
          cacheDel(walletTransactionsCacheKey(txn.userId)).catch(() => {}),
        ]).catch(() => {});

        return res.json({ message: 'Deposit approved and balance updated' });
      }

      // Non-deposit approvals: just mark verified
      await prisma.transaction.update({ where: { id: txn.id }, data: { status: 'completed', verificationStatus: 'verified', verifiedBy: admin.username, verificationNotes: notes || '', completedAt: new Date() } });
      return res.json({ message: 'Transaction approved' });
    }
    if (action === 'reject') {
      const reversalAmount = Number(txn.amount || 0);
      const result = await prisma.$transaction(async (tx) => {
        const updatedTxn = await tx.transaction.update({
          where: { id: txn.id },
          data: {
            status: 'rejected',
            verificationStatus: 'rejected',
            verifiedBy: admin.username,
            verificationNotes: notes || 'Rejected by admin',
            completedAt: new Date(),
          }
        });

        let updatedUser = null;
        if (txn.type === 'withdraw') {
          updatedUser = await tx.user.update({
            where: { id: txn.userId },
            data: { balance: { increment: reversalAmount } },
          });
        }

        return { updatedTxn, updatedUser };
      });

      if (result.updatedUser) {
        void Promise.all([
          cacheUserProfile(result.updatedUser).catch(() => {}),
          cacheUserWalletBalance(result.updatedUser).catch(() => {}),
          cacheDel(walletTransactionsCacheKey(txn.userId)).catch(() => {}),
        ]).catch(() => {});
      }

      return res.json({ message: txn.type === 'withdraw' ? 'Withdrawal rejected and balance restored' : 'Transaction rejected' });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('[admin/verify-transaction] error', err?.message || err);
    return res.status(500).json({ error: 'Unable to verify transaction' });
  }
});

app.get('/api/admin/download-proof', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Missing admin token' });
  const admin = await prisma.admin.findUnique({ where: { username: session.email } });
  if (!admin) return res.status(401).json({ error: 'Invalid admin' });

  const transactionId = req.query.transactionId?.toString();
  if (!transactionId) return res.status(400).json({ error: 'transactionId is required' });

  try {
    // Accept either external `transactionId` (payment gateway id) or internal `id`.
    let txn = await prisma.transaction.findUnique({ where: { transactionId } });
    if (!txn) {
      txn = await prisma.transaction.findUnique({ where: { id: transactionId } });
    }
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });
    const proof = txn.proofUrl;
    if (!proof) return res.status(404).json({ error: 'No proof available' });

    // If proof is an absolute URL, proxy it
    if (/^https?:\/\//i.test(proof)) {
      const resp = await axios.get(proof, { responseType: 'arraybuffer' });
      const contentType = resp.headers['content-type'] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      return res.send(Buffer.from(resp.data));
    }

    // Otherwise assume it's a local file path under uploads.
    const relativeProofPath = String(proof).replace(/^\/+/, '').replace(/^uploads[\\/]+/, '');
    const uploadPath = path.join(uploadsDir, relativeProofPath);
    return res.sendFile(uploadPath);
  } catch (err) {
    console.error('[admin/download-proof] error', err?.message || err);
    return res.status(500).json({ error: 'Unable to fetch proof' });
  }
});

app.post('/api/login', async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Identifier and password are required' });
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: identifier }, { phoneNumber: identifier }],
    },
  });

  if (!user) {
    return res.status(404).json({ error: 'User does not exist. Please register.' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const safeUser = {
    username: user.username,
    email: user.email,
    phoneNumber: user.phoneNumber,
    balance: user.balance,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
  };

  if (user.twoFactorEnabled) {
    return res.json({ requires2fa: true, email: user.email });
  }

  const token = createToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      id: createId(),
      email: user.email,
      token,
      userId: user.id,
      expiresAt,
      updatedAt: new Date(),
    },
  });

  // Fetch fresh DB data for wallet, transactions, bank accounts, and portfolio
  try {
    const transactions = await prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const bankAccounts = await prisma.bankAccount.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    let portfolio = null;
    try {
      portfolio = await getPortfolioSummaryForUser({ userId: user.id, referenceDate: new Date() });
    } catch (err) {
      console.warn('[login] portfolio load failed', err?.message || err);
    }

    // Warm caches asynchronously but don't block the response
    Promise.all([
      cacheUserWalletBalance(user).catch(() => {}),
      cacheUserWalletTransactions(user.id, transactions).catch(() => {}),
      cacheUserBankAccounts(user.id, bankAccounts).catch(() => {}),
      portfolio ? cacheSetIfNewer(portfolioCacheKey(user.id), portfolio, CACHE_TTL_SECONDS, Date.now()).catch(() => {}) : Promise.resolve(),
    ]).catch(() => {});

    return res.json({ user: safeUser, token, wallet: { balance: user.balance, transactions }, bankAccounts, portfolio });
  } catch (err) {
    console.warn('[login] warm data load failed', err?.message || err);
    return res.json({ user: safeUser, token });
  }
});

app.post('/api/2fa/setup', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (user.twoFactorEnabled) {
    return res.status(400).json({ error: 'Two-factor authentication is already enabled' });
  }

  const secret = user.twoFactorSecret || createTwoFactorSecret();
  const otpauthUrl = createTwoFactorOtpAuthUrl(user.email, secret);

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorSecret: secret },
  });

  res.json({ secret, otpauthUrl });
});

app.post('/api/2fa/enable', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: 'Verification code is required' });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (!user.twoFactorSecret) {
    return res.status(400).json({ error: 'Two-factor secret is not configured' });
  }

  if (!verifyTwoFactorCode(code, user.twoFactorSecret)) {
    return res.status(400).json({ error: 'Invalid verification code' });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: true },
  });

  res.json({ message: 'Two-factor authentication enabled successfully' });
});

app.post('/api/2fa/disable', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });

  res.json({ message: 'Two-factor authentication disabled successfully' });
});

app.post('/api/2fa/verify', async (req, res) => {
  const { email, code } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and verification code are required' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!verifyTwoFactorCode(code, user.twoFactorSecret)) {
    return res.status(400).json({ error: 'Invalid verification code' });
  }

  const token = createToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      id: createId(),
      email: user.email,
      token,
      userId: user.id,
      expiresAt,
      updatedAt: new Date(),
    },
  });

  const safeUser = {
    username: user.username,
    email: user.email,
    phoneNumber: user.phoneNumber,
    balance: user.balance,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
  };

  res.json({ user: safeUser, token });
});

app.post('/api/register/send-otp', async (req, res) => {
  const { email, purpose = 'signup' } = req.body || {};

  const existingEmail = await prisma.user.findFirst({ where: { email: { equals: email } } });
  const validation = validateOtpSendRequest({
    email,
    purpose,
    existingUser: existingEmail,
  });

  if (!validation.ok) {
    return res.status(validation.status).json({ error: validation.message });
  }

  const normalizedPurpose = validation.purpose;
  const rateLimit = await canSendOTP(email, normalizedPurpose);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: `Please wait ${rateLimit.retryAfterSeconds} seconds before requesting a new OTP.`,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  try {
    await sendEmailOTP(email, normalizedPurpose);
  } catch (error) {
    console.error(`[${normalizedPurpose}-otp] Failed to send email`, error);
    return res.status(500).json({
      error: normalizedPurpose === 'password_reset'
        ? 'Unable to send password reset email right now.'
        : 'Unable to send verification email right now.',
    });
  }

  res.json({
    message: normalizedPurpose === 'password_reset'
      ? 'Password reset OTP sent to your email address.'
      : 'OTP sent to your email address.',
  });
});

app.post('/api/register/verify-otp', async (req, res) => {
  const { email, otp, purpose = 'signup' } = req.body || {};
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  const existingEmail = await prisma.user.findFirst({ where: { email: { equals: email } } });
  const allowedExistingUser = shouldAllowExistingUserOtp(purpose);
  if (purpose === 'password_reset' && !existingEmail) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (purpose === 'signup' && existingEmail) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const isValid = await verifyOTP(email, otp, purpose);
  if (!isValid) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }

  res.json({ message: 'OTP verified successfully' });
});

app.post('/api/password-reset', async (req, res) => {
  const { email, otp, password } = req.body || {};
  if (!email || !otp || !password) {
    return res.status(400).json({ error: 'Email, OTP, and new password are required' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const isValid = await verifyOTP(email, otp, 'password_reset');
  if (!isValid) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });

  await prisma.oTP.deleteMany({ where: { email, purpose: 'password_reset' } });

  res.json({ message: 'Password reset successful' });
});

app.post('/api/register', async (req, res) => {
  const { username, email, password, phoneNumber, referralCode } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  const existingEmail = await prisma.user.findFirst({ where: { email: { equals: email } } });
  if (existingEmail) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const existingUsername = await prisma.user.findUnique({ where: { username } });
  if (existingUsername) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  if (phoneNumber) {
    const existingPhone = await prisma.user.findUnique({ where: { phoneNumber } });
    if (existingPhone) {
      return res.status(409).json({ error: 'Phone number already registered' });
    }
  }

  const otpRecord = await prisma.oTP.findFirst({
    where: {
      email,
      purpose: 'signup',
      verified: true,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!otpRecord) {
    return res.status(403).json({ error: 'Please verify your email OTP before creating the account' });
  }

  // If a referral code was supplied, normalize and look up the referrer.
  let referrerId = null;
  if (referralCode && String(referralCode).trim()) {
    try {
      const codeNorm = normalizeReferralCode(referralCode);
      const ref = await prisma.user.findFirst({ where: { referralCode: codeNorm } });
      if (ref) referrerId = ref.id;
    } catch (err) {
      console.warn('[referral] lookup failed', err?.message || err);
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const generatedReferralCode = generateReferralCodeForUser(username, Date.now());
  const user = await prisma.user.create({
    data: {
      id: createId(),
      username,
      email,
      phoneNumber,
      password: hashedPassword,
      balance: 0,
      referralCode: generatedReferralCode,
      referredById: referrerId ?? undefined,
    },
  });

  await prisma.oTP.deleteMany({ where: { email, purpose: 'signup' } });

  // If we linked a referrer, increment their referral count (best-effort)
  if (referrerId) {
    try {
      await prisma.user.update({
        where: { id: referrerId },
        data: {
          referralCount: { increment: 1 },
        },
      });
    } catch (err) {
      console.warn('[referral] failed to increment referralCount', err?.message || err);
    }
  }

  res.json({ message: 'Registration successful', userId: user.id, referralCode: user.referralCode });
});

app.get('/api/profile', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const cacheKey = profileCacheKey(session.userId);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const response = {
    user: {
      username: user.username,
      email: user.email,
      phoneNumber: user.phoneNumber,
      balance: user.balance,
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
      referralCode: user.referralCode || null,
      referralCount: user.referralCount || 0,
      referralBonusEarned: user.referralBonusEarned || 0,
    },
  };
  await cacheSetIfNewer(cacheKey, response, CACHE_TTL_SECONDS, Date.now()).catch(() => {});
  res.json(response);
});

app.get('/api/wallet/balance', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const balanceCache = await cacheGet(walletBalanceCacheKey(session.userId));
  const transactionsCache = await cacheGet(walletTransactionsCacheKey(session.userId));
  if (balanceCache && transactionsCache) {
    return res.json({ balance: balanceCache.balance, transactions: transactionsCache });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const transactions = await prisma.transaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const response = { balance: user.balance, transactions };
  await Promise.all([
    cacheUserWalletBalance(user),
    cacheUserWalletTransactions(user.id, transactions),
  ]).catch((err) => {
    console.warn('[cache] wallet warm up failed', err?.message || err);
  });

  res.json(response);
});

app.get('/api/wallet/bank-accounts', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const cached = await cacheGet(bankAccountsCacheKey(session.userId));
  if (cached) {
    return res.json({ bankAccounts: cached });
  }

  const accounts = await prisma.bankAccount.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
  });

  await cacheUserBankAccounts(session.userId, accounts).catch((err) => {
    console.warn('[cache] bank accounts warm up failed', err?.message || err);
  });

  res.json({ bankAccounts: accounts });
});

// Public endpoint for clients to read current deposit settings
app.get('/api/wallet/deposit-settings', async (req, res) => {
  try {
    const settings = await prisma.depositSetting.findFirst({ orderBy: { createdAt: 'desc' } });
    const result = settings ? { ...settings } : {};
    if (settings && settings.qrCodePath) {
      // make an absolute URL for clients
      if (/^https?:\/\//i.test(settings.qrCodePath)) {
        result.qrCodeUrl = settings.qrCodePath;
      } else {
        const host = req.get('host');
        const proto = req.protocol || 'http';
        result.qrCodeUrl = `${proto}://${host}${settings.qrCodePath}`;
      }
    }
    return res.json({ settings: result });
  } catch (err) {
    console.error('[wallet/deposit-settings] error', err?.message || err);
    return res.status(500).json({ error: 'Unable to load deposit settings' });
  }
});

app.post('/api/wallet/bank-accounts', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const { holder, accountNumber, bankName, ifsc, branchName } = req.body || {};
  if (!holder || !accountNumber || !bankName || !ifsc) {
    return res.status(400).json({ error: 'Bank account holder, number, bank name, and IFSC are required' });
  }

  const newAccount = await prisma.bankAccount.create({
    data: {
      id: createId(),
      userId: session.userId,
      accountHolderName: String(holder).trim(),
      accountNumber: String(accountNumber).trim(),
      ifscCode: String(ifsc).trim(),
      bankName: String(bankName).trim(),
      branchName: String(branchName || '').trim(),
      isVerified: false,
    },
  });

  await cacheDel(bankAccountsCacheKey(session.userId)).catch((err) => {
    console.warn('[cache] invalidate bank accounts failed', err?.message || err);
  });

  res.json({ bankAccount: newAccount });
});

app.delete('/api/wallet/bank-accounts/:id', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const accountId = req.params.id;
  if (!accountId) {
    return res.status(400).json({ error: 'Bank account id is required' });
  }

  const existing = await prisma.bankAccount.findFirst({ where: { id: accountId, userId: session.userId } });
  if (!existing) {
    return res.status(404).json({ error: 'Bank account not found' });
  }

  await prisma.bankAccount.delete({ where: { id: accountId } });
  await cacheDel(bankAccountsCacheKey(session.userId)).catch((err) => {
    console.warn('[cache] invalidate bank accounts failed', err?.message || err);
  });

  res.json({ success: true });
});

app.get('/api/portfolio', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const cacheKey = portfolioCacheKey(session.userId);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    const response = await getPortfolioSummaryForUser({ userId: session.userId, referenceDate: new Date() });
    await cacheSetIfNewer(cacheKey, response, CACHE_TTL_SECONDS, Date.now()).catch(() => {});
    return res.json(response);
  } catch (error) {
    const message = error?.message || 'Unable to load portfolio.';
    return res.status(404).json({ error: message });
  }
});

app.post('/api/investment/claim-weekly-earnings', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  try {
    const result = await claimPendingWeekEarnings({ userId: session.userId, referenceDate: new Date() });
    await Promise.all([
      cacheDel(walletBalanceCacheKey(session.userId)),
      cacheDel(portfolioCacheKey(session.userId)),
      cacheDel(walletTransactionsCacheKey(session.userId)),
    ]).catch((err) => {
      console.warn('[cache] invalidate after weekly earnings claim failed', err?.message || err);
    });
    return res.json(result);
  } catch (error) {
    const message = error?.message || 'Unable to claim weekly earnings.';
    const status = error?.statusCode || 500;
    return res.status(status).json({ error: message });
  }
});

app.post('/api/referral/generate', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (user.referralCode) {
    return res.json({ referralCode: user.referralCode });
  }

  try {
    let candidate = user.referralCode || generateReferralCodeForUser(user.username, Date.now());
    let tries = 0;

    while (tries < 12) {
      const existing = await prisma.user.findFirst({ where: { referralCode: candidate } });
      if (!existing || existing.id === user.id) break;
      candidate = generateReferralCodeForUser(user.username, Date.now() + tries + 1);
      tries += 1;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { referralCode: normalizeReferralCode(candidate) || generateReferralCodeForUser(user.username, Date.now()) },
    });
    return res.json({ referralCode: updated.referralCode });
  } catch (err) {
    console.error('[referral] failed to save referral code', err);
    return res.status(500).json({ error: 'Unable to generate referral code' });
  }
});

// Validate a referral code and return basic referrer info for frontend
app.get('/api/referral/validate/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Invalid referral code' });

    const referrer = await prisma.user.findFirst({ where: { referralCode: normalizeReferralCode(code) } });
    if (!referrer) return res.status(404).json({ error: 'Referral code not found' });

    return res.json({ referrerId: referrer.id, referrerName: referrer.username || referrer.email });
  } catch (err) {
    console.error('[referral] validate error', err);
    return res.status(500).json({ error: 'Unable to validate referral code' });
  }
});

app.post('/api/portfolio/purchase', async (req, res) => {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  try {
    console.log('[purchase] incoming request userId=', session?.userId, 'body=', JSON.stringify(req.body));
  } catch (err) {
    console.log('[purchase] incoming request (unable to stringify body)');
  }

  const purchaseStart = Date.now();

  const payload = req.body || {};
  const { planId, planName, planType, amount, amountLabel, returnLabel, returnPercent, durationLabel, totalReturn, premium } = payload;

  // Determine allowed plan amounts per planType
  const numericAmount = Number(amount || 0);
  if (!numericAmount || numericAmount <= 0) {
    return res.status(400).json({ error: 'Plan amount is required' });
  }

  let allowedAmountsForType = [];
  if (planType === 'fno' || planType === 'futures' || planType === 'options') {
    allowedAmountsForType = [10000, 30000, 50000];
  } else if (planType === 'commodities') {
    allowedAmountsForType = [10000, 15000, 25000];
  } else if (planType === 'equity') {
    allowedAmountsForType = [5000, 10000, 20000, 30000, 40000, 50000, 100000, 150000, 200000, 250000, 300000];
  } else {
    // Fallback to the safest small set
    allowedAmountsForType = [10000, 30000, 50000];
  }

  if (!allowedAmountsForType.includes(numericAmount)) {
    return res.status(400).json({ error: 'This plan is not available', supportedAmounts: allowedAmountsForType });
  }

  const planIdValue = String(planId || '').trim();
  if (!planIdValue) {
    return res.status(400).json({ error: 'Plan identifier is required' });
  }

  const quantity = Number(payload.quantity ?? 1);
  if (!quantity || quantity < 1) {
    return res.status(400).json({ error: 'Plan quantity must be at least 1' });
  }
  // For F&O plans enforce single-quantity purchases
  const isFno = (planType === 'fno' || planType === 'futures' || planType === 'options');
  if (isFno && quantity > 1) {
    return res.status(400).json({ error: 'Maximum allowed quantity for F&O plans is 1' });
  }

  // Enforce single-active/30-day cooldown only for F&O plans.
  // To guarantee a client-visible response within ~100ms, run these DB checks with a short timeout.
  // If checks don't complete quickly, we fall back to fast-ack (202) and let the background worker perform final validation.
  async function withTimeout(promise, ms) {
    let settled = false;
    return Promise.race([
      promise.then((r) => ({ ok: true, result: r })).catch((e) => ({ ok: false, error: e })),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), ms)),
    ]);
  }

  let checksTimedOut = false;
  if (isFno) {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const activePromise = prisma.transaction.findFirst({
        where: {
          userId: session.userId,
          type: 'investment',
          investmentPlanId: planIdValue,
          investmentStatus: { in: ['Active', 'Reinvested'] },
        },
      });
      const recentCompletedPromise = prisma.transaction.findFirst({
        where: {
          userId: session.userId,
          type: 'investment',
          investmentPlanId: planIdValue,
          investmentStatus: 'Completed',
          completedAt: { gte: thirtyDaysAgo },
        },
        orderBy: { completedAt: 'desc' },
      });

      const timeoutMs = 80; // keep under 100ms target
      const [activeRes, recentRes] = await Promise.all([
        withTimeout(activePromise, timeoutMs),
        withTimeout(recentCompletedPromise, timeoutMs),
      ]);

      if ((activeRes && activeRes.timeout) || (recentRes && recentRes.timeout)) {
        checksTimedOut = true;
      } else {
        if (activeRes && activeRes.ok && activeRes.result) {
          return res.status(409).json({ code: 'FNO_ACTIVE', error: 'You already have this F&O plan active. Wait until it completes before purchasing again.' });
        }

        const recentCompletedSamePlan = recentRes && recentRes.ok ? recentRes.result : null;
        if (recentCompletedSamePlan && recentCompletedSamePlan.completedAt) {
          const last = new Date(recentCompletedSamePlan.completedAt).getTime();
          const now = Date.now();
          const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
          const elapsed = now - last;
          const remainingMs = Math.max(0, THIRTY_DAYS_MS - elapsed);
          if (remainingMs > 0) {
            const retryAfterSeconds = Math.ceil(remainingMs / 1000);
            const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
            const hours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
            const parts = [];
            if (days) parts.push(`${days} day${days > 1 ? 's' : ''}`);
            if (hours) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
            if (!days && minutes) parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
            const retryAfter = parts.length ? parts.join(' ') : 'less than a minute';

            return res.status(409).json({ code: 'FNO_COOLDOWN', error: 'You can purchase this plan again only after 30 days from completion', retryAfterSeconds, retryAfter });
          }
        }
      }
    } catch (err) {
      console.warn('[purchase] F&O checks failed quickly', err?.message || err);
      // If checks fail quickly, allow fast-ack fallback below
      checksTimedOut = true;
    }
  }

  // Fetch user quickly but don't block beyond the 100ms window. If we can't verify balance quickly,
  // fall back to fast-ack and let the background worker perform the definitive check.
  let user = null;
  try {
    const userRes = await withTimeout(prisma.user.findUnique({ where: { id: session.userId } }), 80);
    if (userRes && userRes.ok) {
      user = userRes.result;
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.balance < numericAmount) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }
    } else {
      // couldn't verify quickly; mark that checks timed out and continue to fast-ack
      checksTimedOut = true;
    }
  } catch (err) {
    console.warn('[purchase] user lookup failed quickly', err?.message || err);
    checksTimedOut = true;
  }

  // Perform validation and purchase atomically using DB-only flow (no Redis).
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Re-run F&O checks inside the transaction to avoid races
      if (isFno) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const activeSamePlan = await tx.transaction.findFirst({
          where: {
            userId: session.userId,
            type: 'investment',
            investmentPlanId: planIdValue,
            investmentStatus: { in: ['Active', 'Reinvested'] },
          },
        });
        if (activeSamePlan) {
          const err = new Error('FNO_ACTIVE');
          err.code = 'FNO_ACTIVE';
          throw err;
        }

        const recentCompletedSamePlan = await tx.transaction.findFirst({
          where: {
            userId: session.userId,
            type: 'investment',
            investmentPlanId: planIdValue,
            investmentStatus: 'Completed',
            completedAt: { gte: thirtyDaysAgo },
          },
          orderBy: { completedAt: 'desc' },
        });
        if (recentCompletedSamePlan && recentCompletedSamePlan.completedAt) {
          const last = new Date(recentCompletedSamePlan.completedAt).getTime();
          const now = Date.now();
          const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
          const elapsed = now - last;
          const remainingMs = Math.max(0, THIRTY_DAYS_MS - elapsed);
          if (remainingMs > 0) {
            const retryAfterSeconds = Math.ceil(remainingMs / 1000);
            const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
            const hours = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
            const parts = [];
            if (days) parts.push(`${days} day${days > 1 ? 's' : ''}`);
            if (hours) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
            if (!days && minutes) parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
            const retryAfter = parts.length ? parts.join(' ') : 'less than a minute';
            const err = new Error('FNO_COOLDOWN');
            err.code = 'FNO_COOLDOWN';
            err.retryAfterSeconds = retryAfterSeconds;
            err.retryAfter = retryAfter;
            throw err;
          }
        }
      }

      // Atomically decrement balance only if sufficient funds
      const updateRes = await tx.user.updateMany({
        where: { id: session.userId, balance: { gte: numericAmount } },
        data: { balance: { decrement: numericAmount } },
      });
      if (!updateRes || updateRes.count === 0) {
        const err = new Error('INSUFFICIENT_BALANCE');
        err.code = 'INSUFFICIENT_BALANCE';
        throw err;
      }

      const purchasedAt = new Date();
      const durationDays = Math.max(parseDurationDays(durationLabel || '30 Days'), 1);
      const expiresAt = new Date(purchasedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

      const workingDays = determineWorkingDays(durationLabel || '30 Days', planType);
      const totalProfit = Number(totalReturn && Number(totalReturn) > 0 ? Number(totalReturn) - numericAmount : numericAmount * ((Number(returnPercent || 0)) / 100));
      const dailyProfit = workingDays ? totalProfit / workingDays : 0;

      const created = await tx.transaction.create({
        data: {
          id: createId(),
          type: 'investment',
          amount: numericAmount,
          status: 'completed',
          description: `Purchased ${planName || 'Investment Plan'}`,
          transactionId: `INV-${Date.now()}`,
          user: { connect: { id: session.userId } },
          investmentPlanId: planIdValue,
          investmentName: planName,
          investmentDuration: durationLabel || `${workingDays} Working Days`,
          investmentDurationDays: workingDays,
          returnPercent: Number(returnPercent || 0),
          expectedReturn: Number(totalReturn || numericAmount + totalProfit),
          totalProfit: Number(totalProfit || 0),
          dailyProfit: Number(dailyProfit || 0),
          investmentStartAt: purchasedAt,
          investmentEndAt: expiresAt,
          workingDays,
          creditedEarnings: 0,
          investmentStatus: 'Active',
          investmentDetails: JSON.stringify({
            planType,
            amountLabel,
            returnLabel,
            returnPercent: Number(returnPercent || 0),
            premium,
            durationLabel: durationLabel || `${workingDays} Working Days`,
            expiresAt: expiresAt.toISOString(),
            workingDays,
            totalProfit: Number(totalProfit || 0),
            dailyProfit: Number(dailyProfit || 0),
            tradingDays: [],
          }),
        },
      });

      const updatedUser = await tx.user.findUnique({ where: { id: session.userId } });
      return { updatedUser, transaction: created };
    });

    const referralAward = await awardReferralBonusForReferrer({
      prisma,
      userId: session.userId,
      purchaseAmount: numericAmount,
    });

    if (referralAward.awarded) {
      console.log('[referral] awarded bonus', {
        referrerId: referralAward.referrerId,
        userId: session.userId,
        bonus: referralAward.bonus,
      });
    }

    // Warm caches asynchronously (fire-and-forget)
    void Promise.all([
      cacheUserProfile({ ...result.updatedUser }),
      cacheUserWalletBalance(result.updatedUser),
      cacheDel(walletTransactionsCacheKey(session.userId)),
      cacheDel(portfolioCacheKey(session.userId)),
    ]).catch(() => {});

    res.json({ balance: result.updatedUser.balance, referralBonusAwarded: referralAward.awarded ? referralAward.bonus : 0 });

    const elapsed = Date.now() - purchaseStart;
    console.log(`[purchase] processed in ${elapsed}ms userId=${session.userId} planId=${planId} amount=${numericAmount}`);
  } catch (err) {
    if (err && err.code === 'FNO_ACTIVE') {
      return res.status(409).json({ code: 'FNO_ACTIVE', error: 'You already have this F&O plan active. Wait until it completes before purchasing again.' });
    }
    if (err && err.code === 'FNO_COOLDOWN') {
      return res.status(409).json({ code: 'FNO_COOLDOWN', error: 'You can purchase this plan again only after 30 days from completion', retryAfterSeconds: err.retryAfterSeconds, retryAfter: err.retryAfter });
    }
    if (err && err.code === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    console.error('[purchase] unexpected error in transaction', err);
    return res.status(500).json({ error: 'Unable to complete purchase at this time' });
  }
});

function parseWalletAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

app.post('/api/wallet/deposit', upload.single('proof'), async (req, res) => {
  const session = await getSessionFromRequest(req);
  const amount = parseWalletAmount(req.body?.amount);
  try {
    console.log('[deposit] incoming', { userId: session?.userId, body: req.body, hasFile: Boolean(req.file && req.file.filename) });
  } catch (e) {}
  const paymentMethod = (req.body && req.body.paymentMethod) || null;
  const utrNumber = (req.body && req.body.utrNumber) || null;

  if (!session) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  if (amount === null || amount < 100) {
    return res.status(400).json({ error: 'Deposit amount must be at least 100' });
  }
  if (!utrNumber || !req.file || !req.file.filename) {
    return res.status(400).json({ error: 'Deposit requires UTR and payment screenshot proof.' });
  }

  const proofUrl = `/uploads/${req.file.filename}`;

  try {
    const transactionData = buildPendingDepositTransactionData({
      amount,
      paymentMethod,
      utrNumber,
      proofUrl,
      userId: session.userId,
      transactionId: `DEP-${Date.now()}`,
    });

    const created = await prisma.transaction.create({
      data: {
        id: createId(),
        type: transactionData.type,
        amount: transactionData.amount,
        status: transactionData.status,
        verificationStatus: transactionData.verificationStatus,
        paymentMethod: transactionData.paymentMethod,
        description: transactionData.description,
        transactionId: transactionData.transactionId,
        user: { connect: { id: session.userId } },
        proofUrl: transactionData.proofUrl,
        utrNumber: transactionData.utrNumber,
        investmentName: '',
        verifiedBy: transactionData.verifiedBy,
        verificationNotes: transactionData.verificationNotes,
        completedAt: transactionData.completedAt,
      },
    });

    void cacheDel(walletTransactionsCacheKey(session.userId)).catch(() => {});

    return res.json({
      message: 'Deposit request submitted for admin verification',
      orderId: created.transactionId,
      status: 'pending',
      balance: await getWalletBalance(session.userId).catch(() => null),
    });
  } catch (err) {
    console.error('[deposit] error creating pending deposit request', err?.message || err);
    return res.status(500).json({ error: 'Unable to submit deposit request at this time' });
  }
});

app.post('/api/wallet/withdraw', async (req, res) => {
  const session = await getSessionFromRequest(req);
  const amount = parseWalletAmount(req.body?.amount);
  const { paymentMethod, bankAccount } = req.body || {};
  if (!session) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  if (amount === null || amount < 100) {
    return res.status(400).json({ error: 'Withdrawal amount must be at least 100' });
  }

  const validPaymentMethods = ['bank', 'upi'];
  if (!paymentMethod || !validPaymentMethods.includes(paymentMethod)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }

  if (paymentMethod === 'bank') {
    if (!bankAccount || !bankAccount.accountNumber) {
      return res.status(400).json({ error: 'Bank account details are required for bank withdrawals' });
    }
  }

  // Fast-path: atomically decrement balance and create a pending withdrawal transaction
  // Use updateMany to ensure atomic check-and-decrement, then create transaction in same tx.
  let bankAccountId = null;
  if (paymentMethod === 'bank') {
    bankAccountId = await findOrCreateBankAccount(session.userId, bankAccount);
    if (!bankAccountId) {
      return res.status(400).json({ error: 'Invalid bank account details for withdrawal' });
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updateRes = await tx.user.updateMany({ where: { id: session.userId, balance: { gte: amount } }, data: { balance: { decrement: amount } } });
      if (!updateRes || updateRes.count === 0) {
        const err = new Error('INSUFFICIENT_BALANCE');
        err.code = 'INSUFFICIENT_BALANCE';
        throw err;
      }

      const created = await tx.transaction.create({
        data: {
          id: createId(),
          type: 'withdraw',
          amount,
          status: 'pending',
          paymentMethod,
          description: 'Withdrawal request',
          transactionId: `WDR-${Date.now()}`,
          user: { connect: { id: session.userId } },
          investmentName: '',
          ...(bankAccountId ? { BankAccount: { connect: { id: bankAccountId } } } : {}),
        },
      });

      const updatedUser = await tx.user.findUnique({ where: { id: session.userId } });
      return { updatedUser, created };
    });

    // Warm caches asynchronously; do not block response
    void Promise.all([
      cacheUserProfile(result.updatedUser).catch(() => {}),
      cacheUserWalletBalance(result.updatedUser).catch(() => {}),
      cacheDel(walletTransactionsCacheKey(session.userId)).catch(() => {}),
      cacheDel(portfolioCacheKey(session.userId)).catch(() => {}),
      cacheDel(bankAccountsCacheKey(session.userId)).catch(() => {}),
    ]).catch(() => {});

    return res.json({ balance: result.updatedUser.balance, message: 'Withdrawal request submitted' });
  } catch (err) {
    if (err && err.code === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    console.error('[withdraw] unexpected error', err);
    return res.status(500).json({ error: 'Unable to submit withdrawal request' });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend server running on http://0.0.0.0:${port}`);
});
