const { finalizeInvestment } = require('../services/investmentEarnings');

jest.mock('../prisma', () => ({
  prisma: (() => {
    const txnCreateMany = jest.fn();
    const txnAggregate = jest.fn();
    const txnUpdate = jest.fn();
    const txnFindFirst = jest.fn();
    const txnUserUpdate = jest.fn();
    const txnTransactionCreate = jest.fn();

    return {
      transaction: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      investmentEarning: {
        createMany: jest.fn(),
        aggregate: jest.fn(),
        findMany: jest.fn(),
      },
      holiday: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((fn) => fn({
        investmentEarning: { createMany: txnCreateMany, aggregate: txnAggregate },
        transaction: { update: txnUpdate, findFirst: txnFindFirst, create: txnTransactionCreate },
        user: { update: txnUserUpdate },
      })),
      // expose txn fns for assertions
      __txn: { txnCreateMany, txnAggregate, txnUpdate, txnFindFirst, txnUserUpdate, txnTransactionCreate },
    };
  })(),
}));

const { prisma } = require('../prisma');

describe('finalizeInvestment', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates earnings and updates transaction', async () => {
    const txnId = 'test-inv-1';
    const createdAt = new Date('2026-07-01T00:00:00.000Z');
    prisma.transaction.findUnique.mockResolvedValue({ id: txnId, userId: 'user-1', amount: 1000, returnPercent: 10, createdAt, investmentStartAt: createdAt, investmentDurationDays: 3 });
    // configure transaction-scoped mocks
    const txn = prisma.__txn;
    txn.txnCreateMany.mockResolvedValue({ count: 3 });
    txn.txnAggregate.mockResolvedValue({ _sum: { amount: 100 } });
    txn.txnUpdate.mockResolvedValue(true);
    txn.txnFindFirst.mockResolvedValue(null);
    txn.txnUserUpdate.mockResolvedValue(true);
    txn.txnTransactionCreate.mockResolvedValue(true);

    await finalizeInvestment(txnId);

    expect(prisma.transaction.findUnique).toHaveBeenCalledWith({ where: { id: txnId } });
    expect(txn.txnCreateMany).toHaveBeenCalled();
    expect(txn.txnUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { balance: { increment: 1000 } },
    });
    expect(txn.txnTransactionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'investment_refund',
        amount: 1000,
        referenceTxnId: txnId,
      }),
    }));
    expect(txn.txnUpdate).toHaveBeenCalled();
  });
});
