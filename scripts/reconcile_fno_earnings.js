const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });
const { prisma } = require('../prisma');

const targetEmails = ['devasai11980@gmail.com', 'devkuni380@gmail.com'];

function createId() {
  return require('crypto').randomBytes(16).toString('hex');
}

function roundToTwo(value) {
  return Number(Number(value || 0).toFixed(2));
}

function getPlanDetails(investment) {
  try {
    return typeof investment.investmentDetails === 'string'
      ? JSON.parse(investment.investmentDetails || '{}')
      : investment.investmentDetails || {};
  } catch {
    return {};
  }
}

async function reconcileUser(user) {
  const investments = await prisma.transaction.findMany({
    where: {
      userId: user.id,
      type: 'investment',
      investmentName: { contains: 'Weekly' },
      investmentStatus: { in: ['Active', 'Reinvested'] },
    },
  });

  let totalCorrection = 0;
  const corrections = [];

  for (const investment of investments) {
    const details = getPlanDetails(investment);
    const isFno = ['fno', 'futures', 'options'].includes(String(details.planType || '').toLowerCase());
    if (!isFno) continue;

    const expectedProfit = roundToTwo(Number(investment.amount || 0) * Number(details.returnPercent || investment.returnPercent || 0) / 100);
    const earnings = await prisma.investmentEarning.findMany({ where: { investmentId: investment.id } });
    const credited = roundToTwo(earnings.reduce((sum, earning) => sum + Number(earning.amount || 0), 0));
    const correction = roundToTwo(expectedProfit - credited);
    if (correction <= 0) continue;

    corrections.push({ investment, correction, expectedProfit, credited });
    totalCorrection = roundToTwo(totalCorrection + correction);
  }

  if (!corrections.length) {
    console.log(`${user.email}: no correction needed`);
    return;
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const item of corrections) {
      await tx.investmentEarning.create({
        data: {
          id: createId(),
          investmentId: item.investment.id,
          amount: item.correction,
          creditedAt: now,
          status: 'reconciled',
          createdAt: now,
          updatedAt: now,
        },
      });

      await tx.transaction.update({
        where: { id: item.investment.id },
        data: {
          creditedEarnings: item.expectedProfit,
          totalProfit: item.expectedProfit,
          dailyProfit: roundToTwo(item.expectedProfit / 5),
          investmentStatus: 'Completed',
          completedAt: now,
        },
      });
    }

    await tx.user.update({
      where: { id: user.id },
      data: { balance: { increment: totalCorrection } },
    });

    await tx.transaction.create({
      data: {
        id: createId(),
        user: { connect: { id: user.id } },
        type: 'earning',
        amount: totalCorrection,
        status: 'completed',
        description: 'F&O earnings reconciliation',
        transactionId: `FNO-RECON-${user.id}`,
        investmentName: 'F&O Earnings Reconciliation',
        completedAt: now,
      },
    });
  });

  console.log(`${user.email}: credited ₹${totalCorrection.toFixed(2)}`);
  for (const item of corrections) {
    console.log(`  ${item.investment.investmentName} ₹${item.investment.amount}: ₹${item.correction.toFixed(2)} correction`);
  }
}

(async () => {
  for (const email of targetEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`User not found: ${email}`);
    await reconcileUser(user);
  }
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});