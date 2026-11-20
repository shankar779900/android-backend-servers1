const crypto = require('crypto');

const REFERRAL_SIGNUP_BONUS = 100;

function createId() {
  return crypto.randomBytes(16).toString('hex');
}

function normalizeReferralCode(code) {
  return String(code || '')
    .trim()
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

function generateReferralCodeForUser(username, seed = Date.now()) {
  const rawName = String(username || 'USER')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();

  const namePart = (rawName || 'USER').slice(0, 4).padEnd(4, 'X');
  const numericSeed = String(seed).replace(/\D/g, '').slice(-6).padStart(6, '0');
  return `${namePart}${numericSeed}`;
}

function getReferralRewardRange(amount) {
  const numericAmount = Number(amount || 0);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return null;

  if (numericAmount < 5000) return { min: 100, max: 100 };
  if (numericAmount <= 20000) return { min: 300, max: 300 };
  if (numericAmount <= 50000) return { min: 500, max: 500 };
  if (numericAmount <= 100000) return { min: 800, max: 800 };
  return { min: 1000, max: 1000 };
}

function generateReferralBonus(amount, signupBonusAlreadyPaid = false) {
  const range = getReferralRewardRange(amount);
  if (!range) return 0;

  const priorSignupBonus = signupBonusAlreadyPaid ? REFERRAL_SIGNUP_BONUS : 0;
  const min = Math.max(0, range.min - priorSignupBonus);
  const max = range.max - priorSignupBonus;
  if (max <= 0) return 0;
  return crypto.randomInt(min, max + 1);
}

async function awardReferralBonusForReferrer({ prisma, userId, purchaseAmount }) {
  if (!prisma || !userId) return { awarded: false, bonus: 0 };

  return prisma.$transaction(async (tx) => {
    const referredUser = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        referredById: true,
        referralSignupBonusPaid: true,
        referralPurchaseBonusPaid: true,
      },
    });

    if (!referredUser || !referredUser.referredById) {
      return { awarded: false, bonus: 0 };
    }

    if (referredUser.referralPurchaseBonusPaid) {
      return { awarded: false, bonus: 0 };
    }

    const bonus = generateReferralBonus(
      purchaseAmount,
      referredUser.referralSignupBonusPaid,
    );

    const referrer = await tx.user.findUnique({
      where: { id: referredUser.referredById },
      select: { id: true, balance: true, referralBonusEarned: true },
    });

    if (!referrer) {
      return { awarded: false, bonus: 0, referrerId: null };
    }

    const claimed = await tx.user.updateMany({
      where: {
        id: userId,
        referralSignupBonusPaid: referredUser.referralSignupBonusPaid,
        referralPurchaseBonusPaid: referredUser.referralPurchaseBonusPaid,
      },
      data: {
        referralSignupBonusPaid: true,
        referralPurchaseBonusPaid: true,
        referralBonusPaid: true,
      },
    });

    if (claimed.count !== 1) return { awarded: false, bonus: 0 };
    if (bonus <= 0) return { awarded: false, bonus: 0 };

    const updatedReferrer = await tx.user.update({
      where: { id: referrer.id },
      data: {
        referralBonusEarned: { increment: bonus },
      },
    });

    const referralScratchCardTransaction = await tx.transaction.create({
      data: {
        id: createId(),
        userId: referrer.id,
        type: 'bonus',
        amount: bonus,
        status: 'pending',
        description: 'Referral bonus scratch card',
        transactionId: `BONUS-SCRATCH-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        investmentName: 'Referral Bonus Scratch Card',
      },
    });

    await tx.scratchCard.create({
      data: {
        id: createId(),
        userId: referrer.id,
        investmentTransactionId: referralScratchCardTransaction.id,
        rewardAmount: bonus,
      },
    });

    return { awarded: true, bonus, referrerId: referrer.id, user: updatedReferrer };
  });
}

module.exports = {
  normalizeReferralCode,
  generateReferralCodeForUser,
  getReferralRewardRange,
  generateReferralBonus,
  awardReferralBonusForReferrer,
};
