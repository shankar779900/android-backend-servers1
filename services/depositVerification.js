function buildPendingDepositTransactionData({
  amount,
  paymentMethod,
  utrNumber,
  proofUrl,
  userId,
  transactionId,
}) {
  return {
    type: 'deposit',
    amount,
    status: 'pending',
    verificationStatus: 'pending',
    paymentMethod: paymentMethod || null,
    description: 'Deposit to wallet',
    transactionId,
    userId,
    proofUrl: proofUrl || null,
    utrNumber: utrNumber || null,
    verificationNotes: 'Awaiting admin verification',
    verifiedBy: null,
    completedAt: null,
  };
}

module.exports = {
  buildPendingDepositTransactionData,
};
