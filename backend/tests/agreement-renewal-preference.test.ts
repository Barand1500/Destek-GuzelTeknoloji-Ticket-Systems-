import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import type { Actor } from '../src/types/express.js';
import { agreementInput, createAgreement, updateAgreement, listAgreements } from '../src/services/agreements.service.js';

const terms = { name: 'Renewal preference', type: 'MONTHLY', startsOn: '2020-01-01', endsOn: '2099-01-01', credits: 5, fee: '10' };

test('agreement preference validates booleans without replacing omitted update values', () => {
  assert.equal(agreementInput.parse(terms).renewalRequested, undefined);
  assert.equal(agreementInput.parse({ ...terms, renewalRequested: false }).renewalRequested, false);
  assert.equal(agreementInput.safeParse({ ...terms, renewalRequested: 'false' }).success, false);
});

test('agreements reject renewal setup, retire historical preference, and preserve credit availability', async () => {
  const suffix = randomUUID();
  const admin = await db.user.create({ data: { name: `Renewal admin ${suffix}`, role: 'ADMIN', passwordHash: 'fixture' } });
  const customer = await db.user.create({ data: { name: `Renewal customer ${suffix}`, role: 'CUSTOMER', passwordHash: 'fixture' } });
  const actor: Actor = { id: admin.id, name: admin.name, email: '', role: 'ADMIN', departmentIds: [], sessionId: '' };
  try {
    const defaultAgreement = await createAgreement(actor, customer.id, terms);
    assert.equal(defaultAgreement.renewalRequested, false);
    await assert.rejects(createAgreement(actor, customer.id, { ...terms, renewalRequested: true }), { code: 'RENEWAL_DISABLED' });
    const requested = await db.agreement.create({ data: { ...terms, customerId: customer.id, startsOn: new Date(terms.startsOn), endsOn: new Date(terms.endsOn), renewalRequested: true } });
    const preserved = await updateAgreement(actor, customer.id, requested.id, terms);
    assert.equal(preserved.renewalRequested, false);
    assert.equal(await db.creditSubscription.count({ where: { customerId: customer.id } }), 0);
    const disabled = await updateAgreement(actor, customer.id, requested.id, { ...terms, renewalRequested: false });
    assert.equal(disabled.renewalRequested, false);
    const logs = await db.activityLog.findMany({ where: { entityId: requested.id, action: 'agreement.updated' }, orderBy: { createdAt: 'asc' } });
    assert.ok(logs.some(log => {
      const metadata = log.metadata as { before: { renewalRequested: boolean }; after: { renewalRequested: boolean } };
      return metadata.before.renewalRequested === true && metadata.after.renewalRequested === false;
    }));
    await db.agreement.update({ where: { id: requested.id }, data: { usedCredits: 6 } });
    const summary = await listAgreements(actor, customer.id);
    const depleted = summary.agreements.find(agreement => agreement.id === requested.id)!;
    assert.equal(depleted.state, 'DEPLETED');
    assert.equal(depleted.usable, false);
    assert.equal(depleted.remainingCredits, 0);
    assert.equal(summary.availableCredits, 5);
  } finally {
    await db.creditSubscription.deleteMany({where:{customerId:customer.id}});
    await db.agreement.deleteMany({ where: { customerId: customer.id } });
    await db.activityLog.deleteMany({ where: { userId: admin.id } });
    await db.user.deleteMany({ where: { id: { in: [admin.id, customer.id] } } });
    await db.$disconnect();
  }
});
