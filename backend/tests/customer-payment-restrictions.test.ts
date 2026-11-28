import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startPaymentReversal } from '../src/services/payment-reversals.service.js';
import { requestCreditRefund } from '../src/services/credit-refund-requests.service.js';
import { changeSubscription } from '../src/services/credit-subscriptions.service.js';

test('customer refunds and subscription stops remain denied before calling providers', async () => {
  const actor = { id: 'customer', role: 'CUSTOMER' as const, name: 'Customer', email: '', departmentIds: [], sessionId: '' };
  await assert.rejects(startPaymentReversal(actor, 'missing-order', {}, false), { code: 'CUSTOMER_REVERSAL_DISABLED', status: 403 });
  await assert.rejects(requestCreditRefund(actor, 'missing-order', {}), { code: 'CUSTOMER_REFUND_REQUEST_DISABLED', status: 403 });
  await assert.rejects(changeSubscription(actor, 'missing-subscription', 'stop'), { code: 'CUSTOMER_CANCELLATION_DISABLED', status: 403 });
});
