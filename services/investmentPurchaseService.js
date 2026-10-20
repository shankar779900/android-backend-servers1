const crypto = require('crypto');
const { prisma } = require('../prisma');
const {
  toIndiaMidnight,
  getTradingDates,
  getTradingEndDateForWorkingDays,
  calculateTotalProfit,
  calculateDailyProfit,
  roundToTwo,
  getIndiaMinutes,
} = require('./investmentEarnings');

function determineWorkingDays(durationLabel, planType) {
  const normalizedLabel = String(durationLabel || '').trim().toLowerCase();
  if (normalizedLabel.includes('month')) {
    return 22;
  }
  const daysMatch = normalizedLabel.match(/(\d+)\s*days?/i);
  if (daysMatch) {
    return Number(daysMatch[1]);
  }
  const weeksMatch = normalizedLabel.match(/(\d+)\s*weeks?/i);
  if (weeksMatch) {
    return Number(weeksMatch[1]) * 5;
  }
  if (planType === 'fno') {
    return 5;
  }
  if (planType === 'equity') {
    return 22;
  }
  return 22;
}

function buildPortfolioPlan(transaction) {
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

  const purchasedAt = transaction.investmentStartAt ? new Date(transaction.investmentStartAt) : new Date(transaction.createdAt);
  const expiresAt = transaction.investmentEndAt ? new Date(transaction.investmentEndAt) : new Date(details.expiresAt || purchasedAt);
  const amount = Number(transaction.amount || 0);
  const expectedReturn = Number(transaction.expectedReturn || 0);
  const returnPercent = Number(transaction.returnPercent || details.returnPercent || (amount && expectedReturn ? ((expectedReturn - amount) / amount) * 100 : 0));
  const totalProfit = Number(transaction.totalProfit ?? details.totalProfit ?? Math.max(expectedReturn - amount, 0));
  const workingDays = Number(transaction.workingDays || details.workingDays || 22);
  const dailyProfit = Number(transaction.dailyProfit ?? details.dailyProfit ?? (workingDays ? totalProfit / workingDays : 0));

  const investmentStatus = transaction.investmentStatus || 'Active';
  const availableActions = investmentStatus === 'Completed'
    ? ['Withdraw']
    : investmentStatus === 'Active'
      ? ['View Details']
      : ['View Details'];

  return {
    id: transaction.investmentPlanId || transaction.id,
    planName: transaction.investmentName || details.planName || 'Investment Plan',
    planType: details.planType || 'equity',
    amount,
    amountLabel: details.amountLabel || `₹${Number(transaction.amount || 0).toLocaleString('en-IN')}`,
    returnLabel: details.returnLabel || 'Up to 0%',
    returnPercent,
    durationLabel: transaction.investmentDuration || details.durationLabel || '22 Working Days',
    totalReturn: expectedReturn || amount + totalProfit,
    totalProfit,
    dailyProfit,
    premium: Boolean(details.premium),
    quantity: 1,
    purchasedAt: purchasedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    workingDays,
    creditedEarnings: Number(transaction.creditedEarnings || 0),
    investmentStatus,
    availableActions,
    transactionId: transaction.transactionId,
  };
}

async function purchaseInvestment({
  userId,
  planId,
  planName,
  planType,
  amount,
  amountLabel,
  returnLabel,
  returnPercent,
  durationLabel,
  premium,
}) {
  const { enqueueFinalize } = require('../queues/finalizeQueue');

  const investmentAmount = Number(amount || 0);
  const returnPct = Number(returnPercent || 0);
  const purchaseTime = new Date();
  const purchaseDay = toIndiaMidnight(purchaseTime);
  const investmentStartAt = getIndiaMinutes(purchaseTime) >= 15 * 60
    ? new Date(purchaseDay.getTime() + 24 * 60 * 60 * 1000)
    : purchaseDay;
  const workingDays = determineWorkingDays(durationLabel, planType);
  const totalProfit = calculateTotalProfit(investmentAmount, returnPct);
  const dailyProfit = calculateDailyProfit(totalProfit, workingDays);
  const expectedReturn = roundToTwo(investmentAmount + totalProfit);

  const estimatedEnd = await getTradingEndDateForWorkingDays(investmentStartAt, workingDays);
  // Enforce F&O single-active / 30-day cooldown inside the DB transaction to avoid races
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const isFno = (planType === 'fno' || planType === 'futures' || planType === 'options');

  const transaction = await prisma.$transaction(async (tx) => {
    if (isFno) {
      const activeSamePlan = await tx.transaction.findFirst({
        where: {
          userId,
          type: 'investment',
          investmentPlanId: String(planId || ''),
          investmentStatus: { in: ['Active', 'Reinvested'] },
        },
      });
      if (activeSamePlan) {
        const err = new Error('You already have this F&O plan active. Wait until it completes before purchasing again.');
        err.code = 'FNO_ACTIVE';
        throw err;
      }

      const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);
      const recentCompletedSamePlan = await tx.transaction.findFirst({
        where: {
          userId,
          type: 'investment',
          investmentPlanId: String(planId || ''),
          investmentStatus: 'Completed',
          completedAt: { gte: thirtyDaysAgo },
        },
        orderBy: { completedAt: 'desc' },
      });

      if (recentCompletedSamePlan && recentCompletedSamePlan.completedAt) {
        const last = new Date(recentCompletedSamePlan.completedAt).getTime();
        const now = Date.now();
        const elapsed = now - last;
        const remainingMs = Math.max(0, THIRTY_DAYS_MS - elapsed);
        if (remainingMs > 0) {
          const err = new Error('You can purchase this plan again only after 30 days from completion');
          err.code = 'FNO_COOLDOWN';
          err.retryAfterSeconds = Math.ceil(remainingMs / 1000);
          err.remainingMs = remainingMs;
          throw err;
        }
      }
    }

    // decrement user balance and create transaction atomically
    await tx.user.update({
      where: { id: userId },
      data: { balance: { decrement: investmentAmount } },
    });

    return tx.transaction.create({
      data: {
        id: crypto.randomBytes(16).toString('hex'),
        type: 'investment',
        amount: investmentAmount,
        status: 'successful',
        description: `Purchased ${planName || 'Investment Plan'}`,
        transactionId: `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        userId,
        investmentPlanId: planId,
        investmentName: planName,
        investmentDuration: durationLabel || `${workingDays} Working Days`,
        investmentDurationDays: workingDays,
        returnPercent: returnPct,
        expectedReturn,
        totalProfit,
        dailyProfit,
        investmentStartAt,
        investmentEndAt: estimatedEnd,
        workingDays,
        creditedEarnings: 0,
        investmentStatus: 'Active',
        investmentDetails: JSON.stringify({
          planType,
          amountLabel,
          returnLabel,
          returnPercent: returnPct,
          premium,
          durationLabel: durationLabel || `${workingDays} Working Days`,
          expiresAt: estimatedEnd.toISOString(),
          workingDays,
          totalProfit,
          dailyProfit,
          tradingDays: [],
        }),
      },
    });
  });

  // enqueue background finalize work (best-effort)
  try {
    void enqueueFinalize(transaction.id);
  } catch (e) {
    console.error('[purchase] failed to enqueue finalize job', e && e.message ? e.message : e);
  }

  return transaction;
}
module.exports = {
  buildPortfolioPlan,
  purchaseInvestment,
};
