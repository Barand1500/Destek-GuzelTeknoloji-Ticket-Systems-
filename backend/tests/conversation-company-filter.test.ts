import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/config/db.js';
import { listConversations } from '../src/services/conversations.service.js';
import { listSchema } from '../src/validators/index.js';

test('company all-person filter includes linked people and preserves visibility and status filters', async () => {
  const owner = await db.user.create({ data: { role: 'CUSTOMER', name: 'Company filter', passwordHash: 'fixture' } });
  const child = await db.user.create({ data: { role: 'CUSTOMER', name: 'Company person', parentCustomerId: owner.id, passwordHash: 'fixture' } });
  const outside = await db.user.create({ data: { role: 'CUSTOMER', name: 'Outside company', passwordHash: 'fixture' } });
  const department = await db.department.create({ data: { name: 'Company filter' } });
  const actor = { id: owner.id, name: owner.name, email: '', role: 'CUSTOMER' as const, departmentIds: [], sessionId: '' };
  try {
    await db.conversation.createMany({ data: [owner, child, outside].map(person => ({ customerId: person.id, departmentId: department.id, subject: 'Filter fixture', searchSubject: 'filter fixture', status: person.id === child.id ? 'PENDING' : 'OPEN' })) });
    assert.equal((await listConversations(actor, listSchema.parse({ customerId: owner.id }))).pagination.total, 1);
    const all = await listConversations(actor, listSchema.parse({ customerId: owner.id, includeChildren: 'true' }));
    assert.equal(all.pagination.total, 2);
    assert.deepEqual(new Set(all.data.map(row => row.customerId)), new Set([owner.id, child.id]));
    assert.equal((await listConversations(actor, listSchema.parse({ customerId: owner.id, includeChildren: 'true', status: 'PENDING' }))).pagination.total, 1);
    assert.equal((await listConversations(actor, listSchema.parse({ customerId: outside.id, includeChildren: 'true' }))).pagination.total, 0);
  } finally {
    await db.conversation.deleteMany({ where: { departmentId: department.id } });
    await db.department.delete({ where: { id: department.id } });
    await db.user.deleteMany({ where: { id: { in: [child.id, outside.id] } } });
    await db.user.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
});
