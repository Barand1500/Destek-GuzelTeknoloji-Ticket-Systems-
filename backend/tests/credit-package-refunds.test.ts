import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import { billingToday } from '../src/services/credit-billing.js';
import { packageSchedule, refreshPackageStart } from '../src/services/credit-package-schedule.js';

test('any refunded package releases the period so a replacement can start right away', async () => {
  const owner = await db.user.create({ data: { name: 'Package refund fixture ' + randomUUID(), role: 'CUSTOMER', passwordHash: 'fixture' } });
  const today = billingToday(), end = new Date(today.getTime() + 30 * 86400000);
  try {
    const grant = await db.agreement.create({ data: { customerId: owner.id, name: 'Refunded monthly package', type: 'MONTHLY', startsOn: today, endsOn: end, fee: '1.00', credits: 0 } });
    const original = await db.creditOrder.create({ data: { customerId: owner.id, requestedById: owner.id, requestKey: randomUUID(), inputHash: 'a'.repeat(64), name: grant.name, kind: 'SUBSCRIPTION', credits: 100, total: '1.00', currency: 'TRY', periodMonths: 1, status: 'REFUNDED', grantedAgreementId: grant.id, paidAt: today } });
    const schedule = await packageSchedule(db, owner.id, 1, null);
    assert.equal(schedule.currentPackage, null, 'A refunded order must not count as the current package, even if the old grant was not cancelled');
    assert.equal(schedule.startsOn, today.toISOString().slice(0, 10));
    const pending = await db.creditOrder.create({ data: { customerId: owner.id, requestedById: owner.id, requestKey: randomUUID(), inputHash: 'b'.repeat(64), name: 'New package', kind: 'SUBSCRIPTION', credits: 100, total: '1.00', currency: 'TRY', periodMonths: 1, periodStartsOn: today, periodEndsOn: end } });
    await db.$transaction(async tx => {
      await refreshPackageStart(tx, pending);
      assert.equal(pending.periodStartsOn?.getTime(), today.getTime(), 'Dispatch must not postpone the replacement behind a refunded period');
    });
    await db.creditOrder.delete({ where: { id: pending.id } });
    await db.creditOrder.update({ where: { id: original.id }, data: { status: 'PARTIAL_REFUND' } });
    await db.agreement.update({ where: { id: grant.id }, data: { credits: 20 } });
    const partial = await packageSchedule(db, owner.id, 1, null);
    assert.equal(partial.currentPackage, null, 'A partially refunded package must not delay the next purchase');
    assert.equal(partial.startsOn, today.toISOString().slice(0, 10), 'The replacement starts immediately after a refund');
  } finally {
    await db.creditOrder.deleteMany({ where: { customerId: owner.id } });
    await db.agreement.deleteMany({ where: { customerId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
});
