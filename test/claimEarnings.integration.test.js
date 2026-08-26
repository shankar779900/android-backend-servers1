const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { claimPendingWeekEarnings } = require('../services/investmentEarnings');

test('claiming weekly earnings creates a transaction and updates user balance', async () => {
  const unique = Date.now();
  const userId = `itest-user-${unique}`;
  const txId = `itest-tx-${unique}`;

  try {
    // create a test user
    await prisma.user.create({
      data: {
        id: userId,
        username: `u${unique}`,
        email: `${userId}@example.com`,
        password: 'test',
        balance: 0,
      },
    });

    // create an investment transaction to attach earnings to
    await prisma.transaction.create({
      data: {
        id: txId,
        userId,
        type: 'investment',
        amount: 1000,
        status: 'completed',
        transactionId: `INV-${unique}`,
        investmentName: 'integration-test',
        investmentDetails: '{}',
      },
    });

    // create 5 unclaimed earnings (one per trading day)
    const now = new Date();
    const earnings = [1, 2, 3, 4, 5].map((i) => ({
      id: `ie-${unique}-${i}`,
      investmentId: txId,
      amount: 10 * i,
      creditedAt: new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000),
      status: 'unclaimed',
    }));

    await prisma.investmentEarning.createMany({ data: earnings });

    // perform the claim
    const result = await claimPendingWeekEarnings({ userId, referenceDate: now });

    // verify a transaction row was created for the claim
    const txns = await prisma.transaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    const found = txns.find((t) => t.type === 'earning' && Math.abs(t.amount - result.claimedAmount) < 0.001);
    assert.ok(found, 'Earning transaction should be created');

    // verify user balance matches
    const updatedUser = await prisma.user.findUnique({ where: { id: userId } });
    assert.equal(updatedUser.balance, result.balance, 'User balance should be updated to claim result');
  } finally {
    // cleanup created rows
    try { await prisma.investmentEarning.deleteMany({ where: { investmentId: txId } }); } catch (e) {}
    try { await prisma.transaction.deleteMany({ where: { userId } }); } catch (e) {}
    try { await prisma.user.deleteMany({ where: { id: userId } }); } catch (e) {}
    await prisma.$disconnect();
  }
});
