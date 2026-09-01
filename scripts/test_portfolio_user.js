const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });
const { prisma } = require('../prisma');
const { processDailyInvestmentEarnings, getPortfolioSummaryForUser } = require('../services/investmentEarnings');

function toIndiaMidnight(date) {
  const dt = new Date(date);
  const indiaDate = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return new Date(`${indiaDate}T00:00:00+05:30`);
}

(async () => {
  try {
    console.log('Running processor...');
    await processDailyInvestmentEarnings();
    console.log('Processor done. Finding today\'s earning...');
    const start = toIndiaMidnight(new Date());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const e = await prisma.investmentEarning.findFirst({ where: { creditedAt: { gte: start, lt: end } } });
    if (!e) {
      console.log('No earnings found for today.');
      process.exit(0);
    }
    const tx = await prisma.transaction.findUnique({ where: { id: e.investmentId } });
    if (!tx) {
      console.log('Transaction not found for earning', e.investmentId);
      process.exit(1);
    }
    console.log('Found earning for investment', e.investmentId, 'userId=', tx.userId);
    const summary = await getPortfolioSummaryForUser({ userId: tx.userId, referenceDate: new Date() });
    console.log('Portfolio summary plans count:', (summary.plans || []).length);
    for (const p of summary.plans) {
      console.log('plan id:', p.id, 'todayGain:', p.todayGain, 'creditedEarnings:', p.creditedEarnings);
    }
    process.exit(0);
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
