const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });
const crypto = require('crypto');
const { prisma } = require('../prisma');
const { generateScratchCardReward } = require('../services/scratchCardRewards');

function createId() {
  return crypto.randomBytes(16).toString('hex');
}

async function main() {
  const apply = process.argv.includes('--apply');
  const investments = await prisma.transaction.findMany({
    where: {
      type: 'investment',
      status: 'completed',
    },
    orderBy: { createdAt: 'asc' },
  });

  let missingCount = 0;
  let createdCount = 0;

  for (const investment of investments) {
    const existingCard = await prisma.scratchCard.findUnique({
      where: { investmentTransactionId: investment.id },
      select: { id: true },
    });

    if (existingCard) continue;

    missingCount += 1;
    const rewardAmount = generateScratchCardReward(investment.amount);
    console.log(`${apply ? 'Creating' : 'Would create'} scratch card for ${investment.userId}: ${investment.investmentName || 'Investment'} - ₹${investment.amount}`);

    if (!apply || !rewardAmount) continue;

    await prisma.scratchCard.create({
      data: {
        id: createId(),
        userId: investment.userId,
        investmentTransactionId: investment.id,
        rewardAmount,
      },
    });
    createdCount += 1;
  }

  console.log(`${apply ? `Created ${createdCount}` : `Found ${missingCount}`} missing scratch card(s).`);
  if (!apply && missingCount > 0) {
    console.log('Run with --apply to create the missing cards.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
