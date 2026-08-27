const test = require('node:test');
const assert = require('node:assert/strict');

const { buildWeeklyEarningsSummary, getPortfolioSummaryForUser } = require('../services/investmentEarnings');
const { prisma } = require('../prisma');

const originalPrisma = prisma;

function mockPrismaForPortfolio(testDate) {
  const today = new Date(testDate);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  prisma.user = { findUnique: async () => ({ id: 'u1', balance: 2000 }) };
  prisma.transaction = {
    findMany: async () => ([{
      id: 'inv-1',
      userId: 'u1',
      type: 'investment',
      amount: 10000,
      expectedReturn: 11000,
      creditedEarnings: 0,
      investmentStatus: 'Active',
      investmentPlanId: 'plan-1',
      investmentName: 'Equity Growth Plan',
      investmentDuration: '1 Month',
      investmentStartAt: new Date('2026-08-01T10:00:00+05:30'),
      createdAt: new Date('2026-08-01T10:00:00+05:30'),
      investmentDetails: JSON.stringify({ planType: 'equity', returnLabel: 'Up to 10%', returnPercent: 10, durationLabel: '1 Month', premium: false, amountLabel: '₹10,000' }),
      workingDays: 22,
      totalProfit: 1000,
    }]),
  };
  prisma.investmentEarning = {
    groupBy: async ({ where }) => {
      if (where && where.creditedAt && where.creditedAt.gte.getTime() === todayStart.getTime()) {
        return [{ investmentId: 'inv-1', _sum: { amount: 200 } }];
      }
      return [{ investmentId: 'inv-1', _sum: { amount: 500 } }];
    },
    findMany: async () => ([{ creditedAt: today, amount: 200, status: 'unclaimed' }]),
  };
  prisma.holiday = { findMany: async () => [] };
}

test('buildWeeklyEarningsSummary shows total unclaimed balance and unlocks claim after 5 trading days', () => {
  const now = new Date('2026-08-17T12:00:00+05:30');
  const earnings = [
    { creditedAt: new Date('2026-08-17T00:00:00+05:30'), amount: 100, status: 'unclaimed' },
    { creditedAt: new Date('2026-08-18T00:00:00+05:30'), amount: 120, status: 'unclaimed' },
    { creditedAt: new Date('2026-08-19T00:00:00+05:30'), amount: 140, status: 'unclaimed' },
    { creditedAt: new Date('2026-08-20T00:00:00+05:30'), amount: 160, status: 'unclaimed' },
    { creditedAt: new Date('2026-08-21T00:00:00+05:30'), amount: 180, status: 'unclaimed' },
  ];

  const summary = buildWeeklyEarningsSummary(earnings, now);

  assert.equal(summary.totalUnclaimed, 700);
  assert.equal(summary.completedTradingDays, 5);
  assert.equal(summary.claimAllowed, true);
  assert.equal(summary.alreadyClaimed, false);
});

test('buildWeeklyEarningsSummary resets to zero after the week is claimed', () => {
  const now = new Date('2026-08-17T12:00:00+05:30');
  const earnings = [
    { creditedAt: new Date('2026-08-17T00:00:00+05:30'), amount: 100, status: 'claimed', claimedAt: new Date('2026-08-18T00:00:00+05:30') },
    { creditedAt: new Date('2026-08-18T00:00:00+05:30'), amount: 120, status: 'claimed', claimedAt: new Date('2026-08-19T00:00:00+05:30') },
    { creditedAt: new Date('2026-08-19T00:00:00+05:30'), amount: 140, status: 'claimed', claimedAt: new Date('2026-08-20T00:00:00+05:30') },
    { creditedAt: new Date('2026-08-20T00:00:00+05:30'), amount: 160, status: 'claimed', claimedAt: new Date('2026-08-21T00:00:00+05:30') },
    { creditedAt: new Date('2026-08-21T00:00:00+05:30'), amount: 180, status: 'claimed', claimedAt: new Date('2026-08-22T00:00:00+05:30') },
  ];

  const summary = buildWeeklyEarningsSummary(earnings, now);

  assert.equal(summary.totalUnclaimed, 0);
  assert.equal(summary.completedTradingDays, 0);
  assert.equal(summary.alreadyClaimed, true);
  assert.equal(summary.claimAllowed, false);
});

test('getPortfolioSummaryForUser includes isTradingDay and todayGain in the portfolio payload', async () => {
  mockPrismaForPortfolio('2026-08-17T12:00:00+05:30');

  const summary = await getPortfolioSummaryForUser({ userId: 'u1', referenceDate: new Date('2026-08-17T12:00:00+05:30') });

  assert.equal(summary.isTradingDay, true);
  assert.equal(summary.plans[0].todayGain, 200);
  assert.equal(summary.plans[0].creditedEarnings, 500);

  prisma.user = originalPrisma.user;
  prisma.transaction = originalPrisma.transaction;
  prisma.investmentEarning = originalPrisma.investmentEarning;
  prisma.holiday = originalPrisma.holiday;
});

test('purchaseInvestment stores return metadata needed for accurate daily crediting', async () => {
  const { purchaseInvestment } = require('../services/investmentPurchaseService');
  const originalPrisma = require('../prisma').prisma;
  let capturedCreateData = null;

  originalPrisma.$transaction = async (fn) => fn({
    user: {
      update: async () => ({ id: 'u1', balance: 90000 }),
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => ({ id: 'u1', balance: 90000 }),
    },
    transaction: {
      findFirst: async () => null,
      create: async ({ data }) => {
        capturedCreateData = data;
        return { id: 'new-inv' };
      },
    },
  });
  originalPrisma.holiday = { findMany: async () => [] };

  await purchaseInvestment({
    userId: 'u1',
    planId: 'plan-10000',
    planName: 'Equity Growth Plan',
    planType: 'equity',
    amount: 10000,
    amountLabel: '₹10,000',
    returnLabel: 'Up to 30%',
    returnPercent: 30,
    durationLabel: '1 Month',
    premium: false,
  });

  assert.equal(capturedCreateData.returnPercent, 30);
  assert.equal(capturedCreateData.totalProfit, 3000);
  assert.equal(capturedCreateData.expectedReturn, 13000);
  assert.equal(capturedCreateData.workingDays, 22);
  assert.equal(capturedCreateData.investmentStatus, 'Active');
  assert.equal(capturedCreateData.creditedEarnings, 0);
});
