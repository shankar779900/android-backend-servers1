const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });
const { prisma } = require('../prisma');
const { getPortfolioSummaryForUser } = require('../services/investmentEarnings');

async function run(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error('User not found');
    process.exit(1);
  }

  const summary = await getPortfolioSummaryForUser({ userId: user.id, referenceDate: new Date() });
  console.log('server totalInvested:', summary.totalInvested.toFixed(2));

  const now = Date.now();
  const activePlans = (summary.plans || []).map((p) => ({ ...p })).filter((p) => {
    const expiresAtMs = p.expiresAt ? new Date(p.expiresAt).getTime() : null;
    const purchasedAtMs = p.purchasedAt ? new Date(p.purchasedAt).getTime() : null;
    const isActive = expiresAtMs ? expiresAtMs > now : true;
    return isActive;
  });

  const activeSum = activePlans.reduce((s, p) => s + Number(p.amount || 0) * (Number(p.quantity || 1)), 0);
  console.log('server active invested sum:', activeSum.toFixed(2));

  console.log('plans (amount x quantity):');
  (summary.plans || []).forEach((p) => {
    console.log(`- id=${p.id} amount=${p.amount} quantity=${p.quantity || 1} expiresAt=${p.expiresAt} status=${p.investmentStatus || 'N/A'}`);
  });

  await prisma.$disconnect();
}

if (require.main === module) {
  const email = process.argv[2] || 'jagathpj4@gmail.com';
  run(email).catch((err) => {
    console.error(err);
    prisma.$disconnect();
    process.exit(1);
  });
}
