import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import type { Actor } from '../src/types/express.js';
import { listCreditHistory } from '../src/services/agreements.service.js';

test('credit history paginates beyond 100 and enforces customer scope', async () => {
  const parent = await db.user.create({ data: { role: 'CUSTOMER', name: 'History ' + randomUUID(), passwordHash: 'fixture' } });
  const child = await db.user.create({ data: { role: 'CUSTOMER', name: 'History child', passwordHash: 'fixture', parentCustomerId: parent.id } });
  const department = await db.department.create({ data: { name: 'History ' + randomUUID() } });
  const ids = Array.from({ length: 125 }, () => randomUUID());
  const actor: Actor = { id: parent.id, name: parent.name, email: '', role: 'CUSTOMER', departmentIds: [], sessionId: '' };
  try {
    await db.conversation.createMany({ data: ids.map(id => ({ id, customerId: child.id, departmentId: department.id, subject: 'History test', searchSubject: 'history test' })) });
    await db.creditCharge.createMany({ data: ids.map(conversationId => ({ conversationId, actorId: parent.id, credits: 1, createdAt: new Date('2026-01-01') })) });
    const seen = new Set<string>();
    for (let page = 1; page <= 7; page++) {
      const result = await listCreditHistory(actor, parent.id, { page, limit: 20 });
      assert.equal(result.pagination.total, 125);
      assert.equal(result.pagination.totalPages, 7);
      assert.equal(result.data.length, page === 7 ? 5 : 20);
      for (const row of result.data) { assert.ok(!seen.has(row.id)); seen.add(row.id); }
    }
    assert.equal(seen.size, 125);
    const companyReport = await listCreditHistory(actor, parent.id, { view: 'people', personId: child.id });
    assert.ok('summary' in companyReport);
    assert.equal(companyReport.summary.net, 125);
    assert.equal(companyReport.data.length, 1);
    assert.equal(companyReport.data[0].id, child.id);
    const outsideFilter = await listCreditHistory(actor, parent.id, { view: 'people', personId: randomUUID() });
    assert.equal(outsideFilter.data.length, 0);
    const childReport = await listCreditHistory({ ...actor, id: child.id }, child.id, { view: 'people' });
    assert.equal('summary' in childReport, false, 'A person without children keeps the simple history');
    assert.equal((await listCreditHistory(actor, parent.id, { page: 100 })).pagination.page, 7);
    await assert.rejects(listCreditHistory({ ...actor, id: child.id }, parent.id, {}), /erişim izniniz yok/);
  } finally {
    await db.creditCharge.deleteMany({ where: { conversationId: { in: ids } } });
    await db.conversation.deleteMany({ where: { id: { in: ids } } });
    await db.department.delete({ where: { id: department.id } });
    await db.user.delete({ where: { id: child.id } });
    await db.user.delete({ where: { id: parent.id } });
    await db.$disconnect();
  }
});
