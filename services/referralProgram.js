const REFERRAL_BONUS_RANGE_LOW = 500;
const REFERRAL_BONUS_RANGE_HIGH = 1000;

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

function calculateReferralBonus(amount) {
  const numericAmount = Number(amount || 0);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return 0;

  if (numericAmount >= 5000 && numericAmount <= 20000) return REFERRAL_BONUS_RANGE_LOW;
  if (numericAmount > 20000) return REFERRAL_BONUS_RANGE_HIGH;
  return 0;
}

async function awardReferralBonusForReferrer({ prisma, userId, purchaseAmount }) {
  if (!prisma || !userId) return { awarded: false, bonus: 0 };

  const referredUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      referredById: true,
      referralBonusPaid: true,
    },
  });

  if (!referredUser || !referredUser.referredById || referredUser.referralBonusPaid) {
    return { awarded: false, bonus: 0 };
  }

  const bonus = calculateReferralBonus(purchaseAmount);
  if (bonus <= 0) {
    return { awarded: false, bonus: 0 };
  }

  const result = await prisma.$transaction(async (tx) => {
    const referrer = await tx.user.findUnique({
      where: { id: referredUser.referredById },
      select: { id: true, balance: true, referralBonusEarned: true },
    });

    if (!referrer) {
      return { awarded: false, bonus: 0, referrerId: null };
    }

    const updatedReferrer = await tx.user.update({
      where: { id: referrer.id },
      data: {
        balance: { increment: bonus },
        referralBonusEarned: { increment: bonus },
      },
    });

    await tx.transaction.create({
      data: {
        id: `${Date.now()}-bonus-${Math.random().toString(16).slice(2, 8)}`,
        user: { connect: { id: referrer.id } },
        type: 'bonus',
        amount: bonus,
        status: 'completed',
        description: 'Referral bonus',
        transactionId: `BONUS-${Date.now()}`,
        investmentName: 'Referral Bonus',
        completedAt: new Date(),
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: { referralBonusPaid: true },
    });

    return { awarded: true, bonus, referrerId: referrer.id, user: updatedReferrer };
  });

  return result;
}

module.exports = {
  REFERRAL_BONUS_RANGE_LOW,
  REFERRAL_BONUS_RANGE_HIGH,
  normalizeReferralCode,
  generateReferralCodeForUser,
  calculateReferralBonus,
  awardReferralBonusForReferrer,
};
