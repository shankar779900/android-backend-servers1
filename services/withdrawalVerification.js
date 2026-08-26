function buildRejectedWithdrawalReversal({ amount, userId, adminUsername, notes }) {
  const reversalAmount = Number(amount || 0);
  return {
    type: 'withdraw',
    amount: reversalAmount,
    userId,
    status: 'rejected',
    verificationStatus: 'rejected',
    verifiedBy: adminUsername || null,
    verificationNotes: notes || 'Rejected by admin',
    completedAt: new Date(),
    reversalAmount,
    balanceDelta: reversalAmount,
  };
}

module.exports = {
  buildRejectedWithdrawalReversal,
};
