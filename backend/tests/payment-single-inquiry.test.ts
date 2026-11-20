import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/config/db.js';
import { runAkbankPaymentChecks } from '../src/services/akbank-payments.service.js';
import { runCreditRenewals } from '../src/services/credit-subscriptions.service.js';

test('automatic payment inquiries wait five minutes and claim each attempt only once', async t => {
 const now = new Date('2026-11-20T12:00:00Z');
 const rows = [
  { id: 'akbank-old', orderId: 'order', provider: 'akbank', status: 'PENDING', createdAt: new Date(now.getTime() - 300000), nextRetryAt: null as Date | null },
  { id: 'akbank-new', orderId: 'order', provider: 'akbank', status: 'PENDING', createdAt: new Date(now.getTime() - 299999), nextRetryAt: null as Date | null },
  { id: 'iyzico-old', orderId: 'order', provider: 'iyzico', status: 'PENDING', createdAt: new Date(now.getTime() - 300000), nextRetryAt: null as Date | null },
 ];
 const original = { findMany: db.creditPaymentAttempt.findMany, updateMany: db.creditPaymentAttempt.updateMany, session: db.paymentCheckoutSession.findUnique };
 t.after(() => { db.creditPaymentAttempt.findMany = original.findMany; db.creditPaymentAttempt.updateMany = original.updateMany; db.paymentCheckoutSession.findUnique = original.session; });
 db.creditPaymentAttempt.findMany = (async ({ where }: any) => rows.filter(row => row.provider === where.provider && row.nextRetryAt === null && row.createdAt <= where.createdAt.lte)) as any;
 db.creditPaymentAttempt.updateMany = (async ({ where, data }: any) => {
  const row = rows.find(row => row.id === where.id && row.nextRetryAt === null);
  if (!row) return { count: 0 };
  row.nextRetryAt = data.nextRetryAt;
  return { count: 1 };
 }) as any;
 let akbankChecks = 0, iyzicoChecks = 0;
 db.paymentCheckoutSession.findUnique = (async () => { akbankChecks++; throw Error('Bank unavailable'); }) as any;
 const provider = { name: 'iyzico' as const, charge: async () => { throw Error('must never charge'); }, reconcile: async () => { iyzicoChecks++; return null; } };
 await runAkbankPaymentChecks(now);
 await runCreditRenewals(provider, now);
 assert.equal(akbankChecks, 1);
 assert.equal(iyzicoChecks, 1);
 await runAkbankPaymentChecks(now);
 await runCreditRenewals(provider, now);
 assert.equal(akbankChecks, 1);
 assert.equal(iyzicoChecks, 1);
 assert.equal(rows[1].nextRetryAt, null);
 await runAkbankPaymentChecks(new Date(now.getTime() + 60000));
 assert.equal(akbankChecks, 2);
});
