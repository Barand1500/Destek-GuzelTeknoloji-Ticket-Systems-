import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import { requestCustomerEmailLogin, verifyCustomerEmailLogin } from '../src/services/customer-email-login.service.js';
import { resolveActor } from '../src/middleware/auth.js';
import { profile, updateProfile, updateCustomer } from '../src/services/management.service.js';
import { profileSchema, updateCustomerSchema } from '../src/validators/management.js';
import { login } from '../src/services/auth.service.js';
import type { Actor } from '../src/types/express.js';

test('Customer email OTP creates a normal session exactly once, rejects ambiguity and enables one-time password setup', async () => {
  const suffix = randomUUID();
  const email = `otp-${suffix}@example.invalid`;
  const customer = await db.user.create({ data: { role: 'CUSTOMER', name: 'OTP fixture', email, passwordHash: 'random-unusable' } });
  const staff = await db.user.create({ data: { role: 'ADMIN', name: 'OTP staff', email: `staff-${email}`, loginEmail: `staff-${email}`, passwordHash: 'test' } });
  const ids = [customer.id, staff.id];
  const originalTx = db.$transaction.bind(db);
  db.$transaction = ((work: any, opts?: any) => originalTx(async tx => {
    const upsert = tx.outboundMessage.upsert.bind(tx.outboundMessage);
    tx.outboundMessage.upsert = ((args: any) => upsert({ ...args, create: { ...args.create, availableAt: new Date('2099-01-01') } })) as typeof upsert;
    return work(tx);
  }, opts)) as typeof db.$transaction;
  const codeFor = async (id: string) => {
    const job = await db.outboundMessage.findUniqueOrThrow({ where: { dedupeKey: `${id}:CUSTOMER_LOGIN` } });
    return String((job.payload as { text: string }).text).match(/\b\d{6}\b/)![0];
  };
  try {
    const unknown = await requestCustomerEmailLogin(`unknown-${email}`);
    const forbidden = await requestCustomerEmailLogin(staff.email!);
    const first = await requestCustomerEmailLogin(email);
    assert.deepEqual(Object.keys(first).sort(), Object.keys(unknown).sort());
    await assert.rejects(verifyCustomerEmailLogin(unknown.challengeId, '123456'));
    await assert.rejects(verifyCustomerEmailLogin(forbidden.challengeId, '123456'));
    const oldCode = await codeFor(first.challengeId);
    const second = await requestCustomerEmailLogin(email);
    await assert.rejects(verifyCustomerEmailLogin(first.challengeId, oldCode));
    const code = await codeFor(second.challengeId);
    assert.notEqual((await db.customerLoginChallenge.findUniqueOrThrow({ where: { userId: customer.id } })).codeHash, code);
    const attempts = await Promise.allSettled([verifyCustomerEmailLogin(second.challengeId, code), verifyCustomerEmailLogin(second.challengeId, code)]);
    assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1);
    const session = (attempts.find(x => x.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof verifyCustomerEmailLogin>>>).value;
    const actor = await resolveActor(session.accessToken);
    assert.equal(actor.role, 'CUSTOMER'); assert.equal(actor.id, customer.id);
    assert.equal((await profile(actor)).canSetPasswordWithoutCurrent, true);
    await assert.rejects(updateProfile(actor, profileSchema.parse({ email: `changed-${email}` })));
    await updateProfile(actor, profileSchema.parse({ password: 'new-password-123' }));
    assert.equal((await profile(actor)).canSetPasswordWithoutCurrent, false);
    await assert.rejects(updateProfile(actor, profileSchema.parse({ password: 'without-proof-123' })));
    await updateCustomer({ id: staff.id, name: staff.name, email: '', role: 'ADMIN', departmentIds: [], sessionId: '' } as Actor, customer.id, updateCustomerSchema.parse({ name: 'Updated OTP customer' }));
    assert.equal((await login({ email, password: 'new-password-123' })).user.id, customer.id);
    const duplicate = await db.user.create({ data: { name: 'Shared email customer', role: 'CUSTOMER', email: `shared-${email}`, passwordHash: 'test' } }); ids.push(duplicate.id);
    const other = await db.user.create({ data: { name: 'Other shared email customer', role: 'CUSTOMER', email: duplicate.email, passwordHash: 'test' } }); ids.push(other.id);
    const ambiguous = await requestCustomerEmailLogin(duplicate.email!);
    assert.equal(await db.outboundMessage.count({ where: { dedupeKey: `${ambiguous.challengeId}:CUSTOMER_LOGIN` } }), 0);
    const blocked = await requestCustomerEmailLogin(email);
    for (let n = 0; n < 5; n++) await assert.rejects(verifyCustomerEmailLogin(blocked.challengeId, '000000'));
    await assert.rejects(verifyCustomerEmailLogin(blocked.challengeId, await codeFor(blocked.challengeId)));
    const expired = await requestCustomerEmailLogin(email);
    await db.customerLoginChallenge.update({ where: { userId: customer.id }, data: { expiresAt: new Date(0) } });
    await assert.rejects(verifyCustomerEmailLogin(expired.challengeId, await codeFor(expired.challengeId)));
  } finally {
    db.$transaction = originalTx;
    await db.outboundMessage.deleteMany({ where: { userId: { in: ids } } });
    await db.customerLoginChallenge.deleteMany({ where: { userId: { in: ids } } });
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.activityLog.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
