const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });
const { prisma } = require('../prisma');

function toIndiaMidnight(date) {
  const dt = new Date(date);
  const indiaDate = dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return new Date(`${indiaDate}T00:00:00+05:30`);
}

(async () => {
  try {
    const start = toIndiaMidnight(new Date());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const rows = await prisma.investmentEarning.findMany({
      where: { creditedAt: { gte: start, lt: end } },
      orderBy: { creditedAt: 'asc' },
      take: 50,
    });

    console.log('todayStart:', start.toISOString());
    console.log('rowsFound:', rows.length);
    for (const r of rows) {
      console.log(r.id, r.investmentId, r.amount, r.creditedAt && r.creditedAt.toISOString());
    }
    process.exit(0);
  } catch (err) {
    console.error('error', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
