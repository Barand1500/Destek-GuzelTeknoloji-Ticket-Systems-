import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import { connectPresence, disconnectPresence, onlineStaffCount, updatePresence } from '../src/services/presence.service.js';
import type { Actor } from '../src/types/express.js';

test('dashboard counts online staff, excludes idle/inactive/deleted accounts and respects role scope', async () => {
  const ids: string[] = [];
  let departmentId: string | undefined;
  try {
    const department = await db.department.create({ data: { name: `Presence test ${randomUUID()}` } });
    departmentId = department.id;
    for (const [role, isActive, deletedAt] of [
      ['ADMIN', true, null], ['SUPERVISOR', true, null], ['AGENT', true, null],
      ['AGENT', false, null], ['AGENT', true, new Date()], ['CUSTOMER', true, null],
    ] as const) {
      const user = await db.user.create({ data: { name: 'Presence test', passwordHash: 'unused', role, isActive, deletedAt } });
      ids.push(user.id);
      await connectPresence(user.id, user.id);
    }
    for (const id of ids.slice(1, 3)) await db.departmentAgent.create({ data: { departmentId, userId: id } });
    updatePresence(ids[2], ids[2], { path: '', page: '', visible: false, lastActivityAt: Date.now() });
    const actor: Actor = { id: ids[0], name: 'Test', email: '', role: 'ADMIN', departmentIds: [], sessionId: '' };
    assert.equal(await onlineStaffCount(actor), 2);
    assert.equal(await onlineStaffCount({ ...actor, role: 'SUPERVISOR', departmentIds: [departmentId] }), 1);
    assert.equal(await onlineStaffCount({ ...actor, accessRole: { id: 'test', name: 'Own', permissions: [], scope: 'OWN' } }), 1);
    assert.equal(await onlineStaffCount({ ...actor, accessRole: { id: 'test', name: 'Department', permissions: [], scope: 'DEPARTMENT' }, departmentIds: [departmentId] }), 1);
    updatePresence(ids[2], ids[2], { path: '', page: '', visible: true, lastActivityAt: Date.now() });
    assert.equal(await onlineStaffCount(actor), 3);
    disconnectPresence(ids[0], ids[0]);
    assert.equal(await onlineStaffCount(actor), 2);
  } finally {
    for (const id of ids) disconnectPresence(id, id);
    await db.user.deleteMany({ where: { id: { in: ids } } });
    if (departmentId) await db.department.delete({ where: { id: departmentId } });
    await db.$disconnect();
  }
});
