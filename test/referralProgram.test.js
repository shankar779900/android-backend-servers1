const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeReferralCode,
  generateReferralCodeForUser,
  getReferralRewardRange,
  generateReferralBonus,
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

test('referral scratch-card ranges match the referred user’s first investment', () => {
  assert.deepEqual(getReferralRewardRange(4999), { min: 100, max: 150 });
  assert.deepEqual(getReferralRewardRange(5000), { min: 200, max: 300 });
  assert.deepEqual(getReferralRewardRange(20000), { min: 200, max: 300 });
  assert.deepEqual(getReferralRewardRange(20001), { min: 350, max: 500 });
  assert.deepEqual(getReferralRewardRange(50000), { min: 350, max: 500 });
  assert.deepEqual(getReferralRewardRange(50001), { min: 600, max: 800 });
  assert.deepEqual(getReferralRewardRange(100000), { min: 600, max: 800 });
  assert.deepEqual(getReferralRewardRange(100001), { min: 850, max: 1000 });
  assert.equal(getReferralRewardRange(0), null);
});

test('referral scratch-card rewards are random integers within the selected total range', () => {
  for (const [investmentAmount, min, max] of [
    [1000, 100, 150],
    [5000, 200, 300],
    [25000, 350, 500],
    [75000, 600, 800],
    [150000, 850, 1000],
  ]) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const reward = generateReferralBonus(investmentAmount);
      assert.equal(Number.isInteger(reward), true);
      assert.ok(reward >= min && reward <= max);
    }
  }
  assert.equal(generateReferralBonus(0), 0);
});

test('first successful investment awards a scratch card within the total referral reward range', async () => {
  const { prisma, created, scratchCards, referredUser, referrer } = createReferralPrisma();
  const result = await awardReferralBonusForReferrer({ prisma, userId: 'user-b', purchaseAmount: 5000 });

  assert.equal(result.awarded, true);
  assert.ok(result.bonus >= 200 && result.bonus <= 300);
  assert.equal(created.length, 1);
  assert.equal(created[0].amount, result.bonus);
  assert.equal(created[0].type, 'bonus');
  assert.equal(created[0].status, 'pending');
  assert.equal(created[0].description, 'Referral bonus scratch card');
  assert.equal(scratchCards.length, 1);
  assert.equal(scratchCards[0].rewardAmount, result.bonus);
  assert.equal(referrer.balance, 0);
  assert.equal(referrer.referralBonusEarned, result.bonus);
  assert.equal(referredUser.referralSignupBonusPaid, true);
  assert.equal(referredUser.referralPurchaseBonusPaid, true);
});

test('only the first successful investment can earn a referral reward', async () => {
  const { prisma, created, scratchCards, referredUser, referrer } = createReferralPrisma();
  const first = await awardReferralBonusForReferrer({ prisma, userId: 'user-b', purchaseAmount: 1000 });
  const second = await awardReferralBonusForReferrer({ prisma, userId: 'user-b', purchaseAmount: 5000 });

  assert.ok(first.bonus >= 100 && first.bonus <= 150);
  assert.equal(second.awarded, false);
  assert.equal(second.bonus, 0);
  assert.equal(created.length, 1);
  assert.equal(scratchCards.length, 1);
  assert.equal(referrer.balance, 0);
  assert.equal(referrer.referralBonusEarned, first.bonus);
  assert.equal(referredUser.referralSignupBonusPaid, true);
  assert.equal(referredUser.referralPurchaseBonusPaid, true);
});

test('a prior signup reward is counted toward the total low-tier referral range', async () => {
  const { prisma, created, referredUser } = createReferralPrisma({ signupBonusPaid: true });
  const first = await awardReferralBonusForReferrer({ prisma, userId: 'user-b', purchaseAmount: 1000 });
  const second = await awardReferralBonusForReferrer({ prisma, userId: 'user-b', purchaseAmount: 5000 });

  assert.ok(first.bonus >= 0 && first.bonus <= 50);
  assert.equal(first.awarded, first.bonus > 0);
  assert.equal(second.awarded, false);
  assert.equal(created.length, first.bonus > 0 ? 1 : 0);
  assert.equal(referredUser.referralPurchaseBonusPaid, true);
});

test('a prior signup reward is deducted from the next referral card total', async () => {
  const { prisma, created, scratchCards, referredUser, referrer } = createReferralPrisma({ signupBonusPaid: true });
  const result = await awardReferralBonusForReferrer({ prisma, userId: 'user-b', purchaseAmount: 5000 });

  assert.equal(result.awarded, true);
  assert.ok(result.bonus >= 100 && result.bonus <= 200);
  assert.equal(created.length, 1);
  assert.equal(created[0].type, 'bonus');
  assert.equal(created[0].amount, result.bonus);
  assert.equal(created[0].status, 'pending');
  assert.equal(scratchCards.length, 1);
  assert.equal(scratchCards[0].rewardAmount, result.bonus);
  assert.equal(referrer.balance, 0);
  assert.equal(referrer.referralBonusEarned, result.bonus);
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
