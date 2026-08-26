const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });
const { prisma } = require('../prisma');

async function run(email) {
  if (!email) {
    console.error('Usage: node analyze_user.js <email>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error('User not found for email:', email);
    process.exit(2);
  }

  console.log('User:', { id: user.id, username: user.username, email: user.email, balance: user.balance });

  // Portfolio: active investments
  const investments = await prisma.transaction.findMany({
    where: { userId: user.id, type: 'investment', investmentStatus: { in: ['Active', 'Reinvested'] } },
    orderBy: { createdAt: 'desc' },
  });

  const portfolioValue = investments.reduce((s, t) => s + Number(t.amount || 0) + Number(t.creditedEarnings || 0), 0);

  console.log('\nPortfolio summary:');
  console.log('  Active investments count:', investments.length);
  console.log('  Portfolio value (amount + creditedEarnings):', portfolioValue);

  if (investments.length) {
    console.log('\n  Investments (latest 20):');
    for (const t of investments.slice(0, 20)) {
      console.log(`   - id=${t.id} amount=${t.amount} creditedEarnings=${t.creditedEarnings || 0} plan=${t.investmentName || '-'} status=${t.investmentStatus} purchasedAt=${t.createdAt}`);
    }
  }

  // All income earnings (InvestmentEarning rows for user's investments)
  const investmentIds = investments.map((i) => i.id);
  const earnings = await prisma.investmentEarning.findMany({ where: { investmentId: { in: investmentIds } }, orderBy: { creditedAt: 'desc' } });
  const totalEarnings = earnings.reduce((s, e) => s + Number(e.amount || 0), 0);

  console.log('\nEarnings for active investments:');
  console.log('  Earning rows count:', earnings.length);
  console.log('  Total earnings (sum of InvestmentEarning.amount):', totalEarnings);

  // Also include all earnings across all investments for this user (including past/completed)
  const allInvestmentsForUser = await prisma.transaction.findMany({ where: { userId: user.id, type: 'investment' }, select: { id: true } });
  const allInvestmentIds = allInvestmentsForUser.map((i) => i.id);
  const allEarnings = await prisma.investmentEarning.findMany({ where: { investmentId: { in: allInvestmentIds } }, orderBy: { creditedAt: 'desc' } });
  const allEarningsTotal = allEarnings.reduce((s, e) => s + Number(e.amount || 0), 0);
  console.log('\nAll earnings across all investments:');
  console.log('  Earning rows count:', allEarnings.length);
  console.log('  Total earnings:', allEarningsTotal);

  // Today's earnings (compare creditedAt date in IST)
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffsetMs);
  const istYear = ist.getUTCFullYear();
  const istMonth = ist.getUTCMonth();
  const istDate = ist.getUTCDate();

  const startOfIstDay = new Date(Date.UTC(istYear, istMonth, istDate, 0, 0, 0) - istOffsetMs);
  const endOfIstDay = new Date(Date.UTC(istYear, istMonth, istDate, 23, 59, 59) - istOffsetMs);

  const todaysEarnings = await prisma.investmentEarning.findMany({ where: { investmentId: { in: allInvestmentIds }, creditedAt: { gte: startOfIstDay, lte: endOfIstDay } } });
  const todaysTotal = todaysEarnings.reduce((s, e) => s + Number(e.amount || 0), 0);

  console.log(`\nToday's earnings (IST date ${istYear}-${istMonth + 1}-${istDate}):`);
  console.log('  Count:', todaysEarnings.length);
  console.log('  Total:', todaysTotal);
  if (todaysEarnings.length) {
    console.log('  Rows:');
    for (const e of todaysEarnings) {
      console.log(`   - investmentId=${e.investmentId} amount=${e.amount} creditedAt=${e.creditedAt} status=${e.status}`);
    }
  }

  // Close prisma connection
  await prisma.$disconnect();
}

if (require.main === module) {
  const email = process.argv[2] || 'jagathpikki@gmail.com';
  run(email).catch((err) => {
    console.error('Error:', err);
    prisma.$disconnect();
    process.exit(99);
  });
}
