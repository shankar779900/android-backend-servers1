const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeReferralCode,
  generateReferralCodeForUser,
  calculateReferralBonus,
  calculateReferralPurchaseBonus,
  awardReferralBonusForReferrer,
  awardReferralSignupBonusForReferrer,
} = require('../services/referralProgram');

test('normalizeReferralCode uppercases and removes separators', () => {
  assert.equal(normalizeReferralCode(' ab-12c '), 'AB12C');
});

test('generateReferralCodeForUser creates a stable uppercase format', () => {
  const code = generateReferralCodeForUser('Jane Doe', '123456');
  assert.equal(code.length >= 8, true);
  assert.match(code, /^[A-Z0-9]+$/);
  assert.equal(code.startsWith('JANE'), true);
  assert.equal(code.slice(0, 4), 'JANE');
  assert.equal(code.slice(-6), '123456');
});

test('calculateReferralBonus applies the fixed first-purchase referral payouts', () => {
  assert.equal(calculateReferralBonus(5000), 500);
  assert.equal(calculateReferralBonus(20000), 500);
  assert.equal(calculateReferralBonus(20001), 1000);
  assert.equal(calculateReferralBonus(4999), 0);
});

test('calculateReferralPurchaseBonus matches the purchase-tier reward without the signup bonus', () => {
  assert.equal(calculateReferralPurchaseBonus(5000), 400);
  assert.equal(calculateReferralPurchaseBonus(20000), 400);
  assert.equal(calculateReferralPurchaseBonus(20001), 900);
  assert.equal(calculateReferralPurchaseBonus(4999), 0);
});

test('awardReferralSignupBonusForReferrer credits a 100 rupee signup bonus to the referrer', async () => {
  const created = [];
  const prisma = {
    user: {
      findUnique: async ({ where }) => {
        if (where.id === 'user-b') {
          return { id: 'user-b', referredById: 'user-a', referralSignupBonusPaid: false, referralBonusPaid: false };
        }
        if (where.id === 'user-a') {
          return { id: 'user-a', balance: 0, referralBonusEarned: 0 };
        }
        return null;
      },
      update: async ({ where, data }) => ({ id: where.id, ...data }),
    },
    $transaction: async (callback) => callback({
      user: {
        findUnique: async ({ where }) => {
          if (where.id === 'user-a') {
            return { id: 'user-a', balance: 0, referralBonusEarned: 0 };
          }
          return null;
        },
        update: async ({ where, data }) => ({ id: where.id, ...data }),
      },
      transaction: {
        create: async (input) => {
          created.push(input.data);
          return { id: 'txn-bonus-signup-1', ...input.data };
        },
      },
    }),
  };

  const result = await awardReferralSignupBonusForReferrer({ prisma, userId: 'user-b' });

  assert.equal(result.awarded, true);
  assert.equal(result.bonus, 100);
  assert.equal(created.length, 1);
  assert.equal(created[0].amount, 100);
  assert.equal(created[0].description, 'Referral signup bonus');
});

test('awardReferralBonusForReferrer still pays the purchase bonus after a signup bonus was already awarded', async () => {
  const created = [];
  const prisma = {
    user: {
      findUnique: async ({ where }) => {
        if (where.id === 'user-b') {
          return { id: 'user-b', referredById: 'user-a', referralPurchaseBonusPaid: false, referralSignupBonusPaid: true, referralBonusPaid: true };
        }
        if (where.id === 'user-a') {
          return { id: 'user-a', balance: 0, referralBonusEarned: 0 };
        }
        return null;
      },
      update: async ({ where, data }) => ({ id: where.id, ...data }),
    },
    $transaction: async (callback) => callback({
      user: {
        findUnique: async ({ where }) => {
          if (where.id === 'user-a') {
            return { id: 'user-a', balance: 0, referralBonusEarned: 0 };
          }
          return null;
        },
        update: async ({ where, data }) => ({ id: where.id, ...data }),
      },
      transaction: {
        create: async (input) => {
          created.push(input.data);
          return { id: 'txn-bonus-purchase-1', ...input.data };
        },
      },
    }),
  };

  const result = await awardReferralBonusForReferrer({ prisma, userId: 'user-b', purchaseAmount: 5000 });

  assert.equal(result.awarded, true);
  assert.equal(result.bonus, 400);
  assert.equal(created.length, 1);
  assert.equal(created[0].amount, 400);
  assert.equal(created[0].description, 'Referral purchase bonus');
});

test('awardReferralBonusForReferrer creates a wallet credit transaction', async () => {
  const created = [];
  const prisma = {
    user: {
      findUnique: async ({ where }) => {
        if (where.id === 'user-b') {
          return { id: 'user-b', referredById: 'user-a', referralBonusPaid: false };
        }
        if (where.id === 'user-a') {
          return { id: 'user-a', balance: 0, referralBonusEarned: 0 };
        }
        return null;
      },
      update: async ({ where, data }) => ({ id: where.id, ...data }),
    },
    $transaction: async (callback) => callback({
      user: {
        findUnique: async ({ where }) => {
          if (where.id === 'user-a') {
            return { id: 'user-a', balance: 0, referralBonusEarned: 0 };
          }
          return null;
        },
        update: async ({ where, data }) => ({ id: where.id, ...data }),
      },
      transaction: {
        create: async (input) => {
          created.push(input.data);
          return { id: 'txn-bonus-1', ...input.data };
        },
      },
    }),
  };

  const result = await awardReferralBonusForReferrer({ prisma, userId: 'user-b', purchaseAmount: 5000 });

  assert.equal(result.awarded, true);
  assert.equal(result.bonus, 400);
  assert.equal(created.length, 1);
  assert.equal(created[0].type, 'bonus');
  assert.equal(created[0].amount, 400);
  assert.equal(created[0].description, 'Referral purchase bonus');
});
