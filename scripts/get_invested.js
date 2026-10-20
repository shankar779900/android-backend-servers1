const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });
const { prisma } = require('../prisma');

async function run(email) {
  if (!email) {
    console.error('Usage: node get_invested.js <email>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error('User not found for email:', email);
    process.exit(2);
  }

  const investments = await prisma.transaction.findMany({
    where: { userId: user.id, type: 'investment', investmentStatus: { in: ['Active', 'Reinvested'] } },
    select: { amount: true, creditedEarnings: true },
  });

  const investedAmount = investments.reduce((s, t) => s + Number(t.amount || 0), 0);
  const credited = investments.reduce((s, t) => s + Number(t.creditedEarnings || 0), 0);
  const portfolioValue = investedAmount + credited;

  console.log('User:', { id: user.id, username: user.username, email: user.email });
  console.log('investedAmount:', investedAmount.toFixed(2));
  console.log('creditedEarnings:', credited.toFixed(2));
  console.log('portfolioValue (amount+credited):', portfolioValue.toFixed(2));

  await prisma.$disconnect();
}

if (require.main === module) {
  const email = process.argv[2] || 'jagathpj4@gmail.com';
  run(email).catch((err) => {
    console.error('Error:', err);
    prisma.$disconnect();
    process.exit(99);
  });
}
