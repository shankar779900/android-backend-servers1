const crypto = require('crypto');

const REFERRAL_SIGNUP_BONUS = 100;
const REFERRAL_BONUS_RANGE_LOW = 500;
const REFERRAL_BONUS_RANGE_HIGH = 1000;
const REFERRAL_PURCHASE_BONUS_LOW = 400;
const REFERRAL_PURCHASE_BONUS_HIGH = 900;

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

function calculateReferralPurchaseBonus(amount) {
  const numericAmount = Number(amount || 0);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return 0;

  if (numericAmount >= 5000 && numericAmount <= 20000) return REFERRAL_PURCHASE_BONUS_LOW;
  if (numericAmount > 20000) return REFERRAL_PURCHASE_BONUS_HIGH;
  return 0;
}

function calculateReferralBonus(amount) {
  const numericAmount = Number(amount || 0);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return 0;

  return REFERRAL_SIGNUP_BONUS + calculateReferralPurchaseBonus(numericAmount);
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

    const signupBonus = referredUser.referralSignupBonusPaid ? 0 : REFERRAL_SIGNUP_BONUS;
    const purchaseBonus = calculateReferralPurchaseBonus(purchaseAmount);
    const bonus = signupBonus + purchaseBonus;

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
  REFERRAL_SIGNUP_BONUS,
  REFERRAL_BONUS_RANGE_LOW,
  REFERRAL_BONUS_RANGE_HIGH,
  REFERRAL_PURCHASE_BONUS_LOW,
  REFERRAL_PURCHASE_BONUS_HIGH,
  normalizeReferralCode,
  generateReferralCodeForUser,
  calculateReferralPurchaseBonus,
  calculateReferralBonus,
  awardReferralBonusForReferrer,
};
