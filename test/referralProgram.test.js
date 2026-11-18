const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeReferralCode,
  generateReferralCodeForUser,
  calculateReferralBonus,
  calculateReferralPurchaseBonus,
  awardReferralBonusForReferrer,
} = require('../services/referralProgram');

function createReferralPrisma({ signupBonusPaid = false, purchaseBonusPaid = false, hasReferrer = true } = {}) {
  const created = [];
  const scratchCards = [];
  const referredUser = {
    id: 'user-b',
    referredById: hasReferrer ? 'user-a' : null,
    referralSignupBonusPaid: signupBonusPaid,
    referralPurchaseBonusPaid: purchaseBonusPaid,
  };
  const referrer = { id: 'user-a', balance: 0, referralBonusEarned: 0 };

  const prisma = {
    $transaction: async (callback) => callback({
      user: {
        findUnique: async ({ where }) => {
          if (where.id === referredUser.id) return { ...referredUser };
          if (where.id === referrer.id && hasReferrer) return { ...referrer };
          return null;
        },
        updateMany: async ({ where, data }) => {
          if (
            where.id !== referredUser.id ||
            where.referralSignupBonusPaid !== referredUser.referralSignupBonusPaid ||
            where.referralPurchaseBonusPaid !== referredUser.referralPurchaseBonusPaid
          ) {
            return { count: 0 };
          }
          Object.assign(referredUser, data);
          return { count: 1 };
        },
        update: async ({ where, data }) => {
          assert.equal(where.id, referrer.id);
          if (data.balance && data.balance.increment) {
            referrer.balance += data.balance.increment;
          }
          if (data.referralBonusEarned && data.referralBonusEarned.increment) {
            referrer.referralBonusEarned += data.referralBonusEarned.increment;
          }
          return { ...referrer };
        },
      },
      transaction: {
        create: async ({ data }) => {
          created.push({ ...data, kind: 'transaction' });
          return { id: `txn-referral-${created.length}`, ...data };
        },
      },
      scratchCard: {
        create: async ({ data }) => {
          scratchCards.push({ ...data, kind: 'scratch-card' });
          return { ...data };
        },
      },
    }),
  };

  return { prisma, created, scratchCards, referredUser, referrer };
}

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

test('calculateReferralBonus includes the deferred signup reward after investment', () => {
  assert.equal(calculateReferralBonus(5000), 500);
  assert.equal(calculateReferralBonus(20000), 500);
  assert.equal(calculateReferralBonus(20001), 1000);
  assert.equal(calculateReferralBonus(4999), 100);
  assert.equal(calculateReferralBonus(0), 0);
});

test('calculateReferralPurchaseBonus matches the purchase-tier reward without the signup bonus', () => {
  assert.equal(calculateReferralPurchaseBonus(5000), 400);
  assert.equal(calculateReferralPurchaseBonus(20000), 400);
  assert.equal(calculateReferralPurchaseBonus(20001), 900);
  assert.equal(calculateReferralPurchaseBonus(4999), 0);
});

test('first successful investment awards the deferred signup bonus and eligible purchase bonus as a scratch card', async () => {
  const { prisma, created, scratchCards, referredUser, referrer } = createReferralPrisma();
  const result = await awardReferralBonusForReferrer({ prisma, userId: 'user-b', purchaseAmount: 5000 });

  assert.equal(result.awarded, true);
  assert.equal(result.bonus, 500);
  assert.equal(created.length, 1);
  assert.equal(created[0].amount, 500);
  assert.equal(created[0].type, 'bonus');
  assert.equal(created[0].status, 'pending');
  assert.equal(created[0].description, 'Referral bonus scratch card');
  assert.equal(scratchCards.length, 1);
  assert.equal(scratchCards[0].rewardAmount, 500);
  assert.equal(referrer.balance, 0);
  assert.equal(referrer.referralBonusEarned, 500);
  assert.equal(referredUser.referralSignupBonusPaid, true);
  assert.equal(referredUser.referralPurchaseBonusPaid, true);
});

test('only the first successful investment can earn a referral reward', async () => {
  const { prisma, created, scratchCards, referredUser, referrer } = createReferralPrisma();
  const first = await awardReferralBonusForReferrer({ prisma, userId: 'user-b', purchaseAmount: 1000 });
  const second = await awardReferralBonusForReferrer({ prisma, userId: 'user-b', purchaseAmount: 5000 });

  assert.equal(first.bonus, 100);
  assert.equal(second.awarded, false);
  assert.equal(second.bonus, 0);
  assert.equal(created.length, 1);
  assert.equal(scratchCards.length, 1);
  assert.equal(referrer.balance, 0);
  assert.equal(referrer.referralBonusEarned, 100);
  assert.equal(referredUser.referralSignupBonusPaid, true);
  assert.equal(referredUser.referralPurchaseBonusPaid, true);
});

test('a first investment below the qualifying tier prevents later referral payouts for legacy signup rewards', async () => {
  const { prisma, created, referredUser } = createReferralPrisma({ signupBonusPaid: true });
  const first = await awardReferralBonusForReferrer({ prisma, userId: 'user-b', purchaseAmount: 1000 });
  const second = await awardReferralBonusForReferrer({ prisma, userId: 'user-b', purchaseAmount: 5000 });

  assert.equal(first.awarded, false);
  assert.equal(first.bonus, 0);
  assert.equal(second.awarded, false);
  assert.equal(created.length, 0);
  assert.equal(referredUser.referralPurchaseBonusPaid, true);
});

test('a prior signup payout is not repeated when the referred user invests', async () => {
  const { prisma, created, scratchCards, referredUser, referrer } = createReferralPrisma({ signupBonusPaid: true });
  const result = await awardReferralBonusForReferrer({ prisma, userId: 'user-b', purchaseAmount: 5000 });

  assert.equal(result.awarded, true);
  assert.equal(result.bonus, 400);
  assert.equal(created.length, 1);
  assert.equal(created[0].type, 'bonus');
  assert.equal(created[0].amount, 400);
  assert.equal(created[0].status, 'pending');
  assert.equal(scratchCards.length, 1);
  assert.equal(scratchCards[0].rewardAmount, 400);
  assert.equal(referrer.balance, 0);
  assert.equal(referrer.referralBonusEarned, 400);
  assert.equal(referredUser.referralSignupBonusPaid, true);
  assert.equal(referredUser.referralPurchaseBonusPaid, true);
});

test('users without a referrer do not create referral rewards', async () => {
  const { prisma, created } = createReferralPrisma({ hasReferrer: false });
  const result = await awardReferralBonusForReferrer({ prisma, userId: 'user-b', purchaseAmount: 5000 });

  assert.equal(result.awarded, false);
  assert.equal(result.bonus, 0);
  assert.equal(created.length, 0);
});
