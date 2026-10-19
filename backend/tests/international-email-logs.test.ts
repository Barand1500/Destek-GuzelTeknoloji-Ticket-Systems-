import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import { activityLogs } from '../src/services/management.service.js';

test('log search finds current and historical IDN recipients and nested changes before pagination', async () => {
  let userId = '';
  const logs: string[] = [];
  try {
    const suffix = randomUUID();
    const user = await db.user.create({ data: { name: `Log search ${suffix}`, email: 'actor@xn--gzelteknoloji-wob.com', role: 'ADMIN', passwordHash: 'test-only' } }); userId = user.id;
    const email = `baran-${suffix}@xn--gzelteknoloji-wob.com`;
    for (const [index, metadata] of [{ recipient: email, reason: 'Talep kanal mesajı' }, { changes: { email: { from: null, to: email } } }, { senderEmail: email }, { recipient: 'unrelated@example.test' }].entries()) {
      const row = await db.activityLog.create({ data: { userId, entityType: 'Test', entityId: suffix, action: index === 1 ? 'customer.updated' : 'conversation.email_sent', metadata, createdAt: new Date(`202${index}-01-01T00:00:00Z`) } }); logs.push(row.id);
    }
    const actor = { id: userId, name: user.name, email: user.email!, role: 'ADMIN' as const, departmentIds: [], sessionId: 'test' };
    const query = { page: 1, limit: 1, userId };
    for (const search of [`baran-${suffix}@gü`, `baran-${suffix}@g`, email]) {
      const first = await activityLogs(actor, { ...query, search });
      assert.equal(first.pagination.total, 3, search);
      assert.equal(first.data[0]?.id, logs[2]);
      assert.equal((await activityLogs(actor, { ...query, search, page: 2 })).data[0]?.id, logs[1]);
      assert.equal((await activityLogs(actor, { ...query, search, page: 4 })).data.length, 0);
      assert.equal((await activityLogs(actor, { ...query, search, action: 'customer.updated' })).pagination.total, 1);
    }
    assert.equal((await activityLogs(actor, { ...query, search: 'actor@gü' })).pagination.total, 4);
    assert.equal((await activityLogs(actor, { ...query, userId: randomUUID(), search: `baran-${suffix}@gü` })).pagination.total, 0);
  } finally {
    await db.activityLog.deleteMany({ where: { id: { in: logs } } });
    if (userId) await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  }
});
