const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });
const crypto = require('crypto');
const { prisma } = require('../prisma');

function createId() {
  return crypto.randomBytes(16).toString('hex');
}

function roundToTwo(value) {
  return Number(Number(value || 0).toFixed(2));
}

async function main() {
  const apply = process.argv.includes('--apply');
  const investments = await prisma.transaction.findMany({
    where: {
      type: 'investment',
      investmentStatus: 'Completed',
    },
    orderBy: { completedAt: 'asc' },
  });

  let pendingCount = 0;
  let pendingTotal = 0;

  for (const investment of investments) {
    const principal = roundToTwo(investment.amount);
    if (principal <= 0) continue;

    const existingRefund = await prisma.transaction.findFirst({
      where: {
        type: 'investment_refund',
        referenceTxnId: investment.id,
      },
      select: { id: true },
    });
    if (existingRefund) continue;

    pendingCount += 1;
    pendingTotal = roundToTwo(pendingTotal + principal);
    console.log(`${apply ? 'Refunding' : 'Would refund'} ${investment.userId}: ₹${principal.toFixed(2)} for ${investment.investmentName || investment.id}`);

    if (!apply) continue;

    await prisma.$transaction(async (tx) => {
      const refundAlreadyCreated = await tx.transaction.findFirst({
        where: {
          type: 'investment_refund',
          referenceTxnId: investment.id,
        },
        select: { id: true },
      });
      if (refundAlreadyCreated) return;

      await tx.user.update({
        where: { id: investment.userId },
        data: { balance: { increment: principal } },
      });

      await tx.transaction.create({
        data: {
          id: createId(),
          type: 'investment_refund',
          amount: principal,
          status: 'completed',
          description: `Principal refunded for ${investment.investmentName || 'Investment Plan'}`,
          transactionId: `REFUND-${investment.id}`,
          user: { connect: { id: investment.userId } },
          investmentName: investment.investmentName || 'Investment Plan',
          referenceTxnId: investment.id,
          completedAt: new Date(),
        },
      });
    });
  }

  console.log(`${apply ? 'Refunded' : 'Pending'} ${pendingCount} completed investment(s), total ₹${pendingTotal.toFixed(2)}`);
  if (!apply && pendingCount > 0) {
    console.log('Run with --apply to credit these refunds.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
