import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import { db } from '../src/config/db.js';
import { createRelatedCustomer } from '../src/services/agreements.service.js';
import type { Actor } from '../src/types/express.js';

test('Quick creation links a new child or parent atomically with both customer permissions', async () => {
  const suffix = randomUUID(), ids: string[] = [];
  const originalTx = db.$transaction.bind(db);
  db.$transaction = ((work: any, opts?: any) => originalTx(async tx => {
    const upsert = tx.outboundMessage.upsert.bind(tx.outboundMessage);
    tx.outboundMessage.upsert = ((args: any) => upsert({ ...args, create: { ...args.create, availableAt: new Date('2099-01-01') } })) as typeof upsert;
    return work(tx);
  }, opts)) as typeof db.$transaction;
  try {
    const staff = await db.user.create({ data: { name: 'Quick-create staff', role: 'ADMIN', passwordHash: 'test' } }); ids.push(staff.id);
    const parent = await db.user.create({ data: { name: 'Quick-create parent', role: 'CUSTOMER', passwordHash: 'test' } }); ids.push(parent.id);
    const orphan = await db.user.create({ data: { name: 'Quick-create orphan', role: 'CUSTOMER', passwordHash: 'test' } }); ids.push(orphan.id);
    const actor: Actor = { id: staff.id, name: staff.name, email: '', role: 'ADMIN', departmentIds: [], sessionId: '' };
    const input = { name: `Quick child ${suffix}`, email: `quick-${suffix}@example.invalid`, phone: '05' + String(randomInt(100000000,999999999)), company: 'Quick company' };
    await assert.rejects(createRelatedCustomer({ ...actor, role: 'AGENT', rolePermissions: ['customers.update'] }, parent.id, { direction: 'CHILD', customer: input }));
    const child = await createRelatedCustomer(actor, parent.id, { direction: 'CHILD', customer: input }); ids.push(child.id);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: child.id } })).parentCustomerId, parent.id);
    await assert.rejects(createRelatedCustomer(actor, child.id, { direction: 'CHILD', customer: { ...input, email: `blocked-${input.email}` } }));
    assert.equal(await db.user.count({ where: { email: `blocked-${input.email}` } }), 0);
    const newParent = await createRelatedCustomer(actor, orphan.id, { direction: 'PARENT', customer: { ...input, name: `New parent ${suffix}`, phone: '05' + String(randomInt(100000000,999999999)), email: `parent-${input.email}` } }); ids.push(newParent.id);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: orphan.id } })).parentCustomerId, newParent.id);
  } finally {
    db.$transaction = originalTx;
    await db.user.updateMany({ where: { id: { in: ids } }, data: { parentCustomerId: null } });
    await db.outboundMessage.deleteMany({ where: { userId: { in: ids } } });
    await db.activityLog.deleteMany({ where: { userId: { in: ids } } });
    await db.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { type: 'CUSTOMER_CREATED', message: { contains: suffix } }] } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
