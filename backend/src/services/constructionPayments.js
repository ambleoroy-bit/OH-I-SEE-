'use strict';
const crypto = require('node:crypto');
const { fail } = require('./constructionDomain');
function verifySignature(raw, signature, secret) {
  if (!secret || !Buffer.isBuffer(raw) || !/^[a-f0-9]{64}$/i.test(signature || '')) return false;
  return crypto.timingSafeEqual(crypto.createHmac('sha256', secret).update(raw).digest(), Buffer.from(signature, 'hex'));
}
function capturedPayment(row, event) {
  const payment = event.payload?.payment?.entity;
  if (event.event !== 'payment.captured') return null;
  if (!payment || payment.status !== 'captured' || payment.captured !== true || !payment.id || payment.order_id !== row.data.payment?.order_id || payment.amount !== row.data.payment.amount || payment.currency !== 'INR') fail('Payment does not match the stored order.', 400);
  if (row.data.payment.status === 'captured') {
    if (row.data.payment.transaction_id !== payment.id) fail('Conflicting payment.', 409);
    return null;
  }
  if (row.data.stage !== 'payment') fail('Contract is not awaiting payment.', 409);
  const data = structuredClone(row.data);
  data.payment = { ...data.payment, status: 'captured', transaction_id: payment.id, verified_at: new Date().toISOString(), webhook_verified: true };
  data.stage = 'ready';
  return data;
}
module.exports = { verifySignature, capturedPayment };
