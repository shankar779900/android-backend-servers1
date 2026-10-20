const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });
const { prisma } = require('../prisma');

async function run(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return console.error('User not found');

  const allInvestments = await prisma.transaction.findMany({ where: { userId: user.id, type: 'investment' }, select: { id: true } });
  const ids = allInvestments.map(i => i.id);
  if (!ids.length) return console.log('No investments for user');

  const rows = await prisma.investmentEarning.findMany({ where: { investmentId: { in: ids } }, orderBy: { creditedAt: 'desc' }, take: 50 });
  console.log(`Found ${rows.length} earnings (latest 50):`);
  for (const r of rows) {
    console.log(`${r.id} | investmentId=${r.investmentId} | amount=${r.amount} | creditedAt=${r.creditedAt.toISOString()} | status=${r.status}`);
  }
  await prisma.$disconnect();
}

if (require.main === module) {
  const email = process.argv[2] || 'jagathpikki@gmail.com';
  run(email).catch(err => { console.error(err); prisma.$disconnect(); process.exit(1); });
}
