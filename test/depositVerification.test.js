const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPendingDepositTransactionData } = require('../services/depositVerification');

test('buildPendingDepositTransactionData keeps deposit requests pending for admin review', () => {
  const tx = buildPendingDepositTransactionData({
    amount: 2500,
    paymentMethod: 'upi',
    utrNumber: 'UTR123456789',
    proofUrl: '/uploads/proof-123.png',
    userId: 'user_123',
    transactionId: 'DEP-123',
  });

  assert.equal(tx.type, 'deposit');
  assert.equal(tx.status, 'pending');
  assert.equal(tx.verificationStatus, 'pending');
  assert.equal(tx.paymentMethod, 'upi');
  assert.equal(tx.utrNumber, 'UTR123456789');
  assert.equal(tx.proofUrl, '/uploads/proof-123.png');
  assert.equal(tx.verifiedBy, null);
  assert.equal(tx.verificationNotes, 'Awaiting admin verification');
  assert.equal(tx.completedAt, null);
});

const { buildRejectedWithdrawalReversal } = require('../services/withdrawalVerification');

test('buildRejectedWithdrawalReversal returns the deducted amount as a wallet credit reversal', () => {
  const reversal = buildRejectedWithdrawalReversal({
    amount: 100000,
    userId: 'user_123',
    adminUsername: 'deva',
    notes: 'Rejected after review',
  });

  assert.equal(reversal.type, 'withdraw');
  assert.equal(reversal.status, 'rejected');
  assert.equal(reversal.verificationStatus, 'rejected');
  assert.equal(reversal.amount, 100000);
  assert.equal(reversal.reversalAmount, 100000);
  assert.equal(reversal.balanceDelta, 100000);
  assert.equal(reversal.verifiedBy, 'deva');
});
