import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/config/db.js';
import { runAkbankPaymentChecks } from '../src/services/akbank-payments.service.js';
import { runCreditRenewals } from '../src/services/credit-subscriptions.service.js';
import { nextReversalCheckAt } from '../src/services/payment-reversals.service.js';

test('automatic payment inquiries wait five minutes, retry up to three bounded times (~5m, ~15m, ~30m) and then stop', async t => {
 const now = new Date('2026-11-20T12:00:00Z');
 const rows = [
  { id: 'akbank-old', orderId: 'order', provider: 'akbank', status: 'PENDING', createdAt: new Date(now.getTime() - 300000), nextRetryAt: null as Date | null },
  { id: 'akbank-new', orderId: 'order', provider: 'akbank', status: 'PENDING', createdAt: new Date(now.getTime() - 299999), nextRetryAt: null as Date | null },
  { id: 'iyzico-old', orderId: 'order', provider: 'iyzico', status: 'PENDING', createdAt: new Date(now.getTime() - 300000), nextRetryAt: null as Date | null },
 ];
 const original = { findMany: db.creditPaymentAttempt.findMany, updateMany: db.creditPaymentAttempt.updateMany, session: db.paymentCheckoutSession.findUnique };
 t.after(() => { db.creditPaymentAttempt.findMany = original.findMany; db.creditPaymentAttempt.updateMany = original.updateMany; db.paymentCheckoutSession.findUnique = original.session; });
 db.creditPaymentAttempt.findMany = (async ({ where }: any) => rows.filter(row => {
  if (row.provider !== where.provider || row.status !== where.status) return false;
  return where.OR.some((branch: any) => {
   if (branch.nextRetryAt === null) return row.nextRetryAt === null && row.createdAt <= branch.createdAt.lte;
   return row.nextRetryAt !== null && row.nextRetryAt <= branch.nextRetryAt.lte && row.createdAt >= branch.createdAt.gte;
  });
 })) as any;
 db.creditPaymentAttempt.updateMany = (async ({ where, data }: any) => {
  const row = rows.find(row => row.id === where.id && row.status === where.status && row.nextRetryAt?.getTime() === where.nextRetryAt?.getTime());
  if (!row) return { count: 0 };
  row.nextRetryAt = data.nextRetryAt;
  return { count: 1 };
 }) as any;
 let akbankChecks = 0, iyzicoChecks = 0;
 db.paymentCheckoutSession.findUnique = (async () => { akbankChecks++; throw Error('Bank unavailable'); }) as any;
 const provider = { name: 'iyzico' as const, charge: async () => { throw Error('must never charge'); }, reconcile: async () => { iyzicoChecks++; return null; } };
 // 1st inquiry at 5m
 await runAkbankPaymentChecks(now);
 await runCreditRenewals(provider, now);
 assert.equal(akbankChecks, 1);
 assert.equal(iyzicoChecks, 1);
 // Same timestamp must not repeat
 await runAkbankPaymentChecks(now);
 await runCreditRenewals(provider, now);
 assert.equal(akbankChecks, 1);
 assert.equal(iyzicoChecks, 1);
 assert.equal(rows[1].nextRetryAt, null);
 // 2nd inquiry at 15m (+10m)
 const at15m = new Date(now.getTime() + 10 * 60_000);
 await runAkbankPaymentChecks(at15m); // triggers akbank-old (2nd) and akbank-new (1st)
 await runCreditRenewals(provider, at15m);
 assert.equal(akbankChecks, 3);
 assert.equal(iyzicoChecks, 2);
 // 3rd inquiry at 30m (+25m from 5m)
 const at30m = new Date(now.getTime() + 25 * 60_000);
 await runAkbankPaymentChecks(at30m); // akbank-old (3rd) and akbank-new (2nd)
 await runCreditRenewals(provider, at30m);
 assert.equal(akbankChecks, 5);
 assert.equal(iyzicoChecks, 3);
 // After 3rd inquiry, iyzico-old and akbank-old must stop permanently
 const at45m = new Date(now.getTime() + 40 * 60_000);
 await runCreditRenewals(provider, at45m);
 assert.equal(iyzicoChecks, 3);
 const at3h = new Date(now.getTime() + 180 * 60_000);
 await runAkbankPaymentChecks(at3h);
 await runCreditRenewals(provider, at3h);
 assert.equal(iyzicoChecks, 3);
});

test('reversal automatic checks back off from 5m to 30m and stop after 4 hours', () => {
 const created = new Date('2026-11-20T12:00:00Z');
 const at10m = new Date(created.getTime() + 10 * 60_000);
 const at45m = new Date(created.getTime() + 45 * 60_000);
 const at4h = new Date(created.getTime() + 4 * 60 * 60_000);
 assert.equal(nextReversalCheckAt(created, at10m)?.getTime(), at10m.getTime() + 5 * 60_000);
 assert.equal(nextReversalCheckAt(created, at45m)?.getTime(), at45m.getTime() + 30 * 60_000);
 assert.equal(nextReversalCheckAt(created, at4h), null);
});
