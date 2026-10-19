import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import type { Actor } from '../src/types/express.js';
import { addMessage, createConversation, getConversation, listConversations, updateConversation } from '../src/services/conversations.service.js';
import { deleteUser, departmentAgents, reports } from '../src/services/management.service.js';
import { listSchema } from '../src/validators/index.js';

test('multiple assignees survive replies, filtering, removal, concurrent replies and staff deletion', async () => {
  const suffix = randomUUID(), users: string[] = [], conversations: string[] = [], departments: string[] = [];
  async function person(role: Actor['role'], departmentId: string, scope = 'DEPARTMENT'): Promise<Actor> {
    const user = await db.user.create({ data: { name: `${role} ${suffix} ${users.length}`, role, passwordHash: 'test', departments: { create: { departmentId } } } });
    users.push(user.id);
    return { id: user.id, name: user.name, email: '', role, departmentIds: [departmentId], sessionId: 'test', roleScope: role === 'ADMIN' ? 'ALL' : scope,
      rolePermissions: ['conversations.view', 'conversations.reply', 'conversations.note', 'conversations.assign', 'conversations.update'] };
  }
  try {
    for (let i = 0; i < 2; i++) departments.push((await db.department.create({ data: { name: `Multi ${suffix} ${i}` } })).id);
    const admin = await person('ADMIN', departments[0]), a = await person('AGENT', departments[0]), b = await person('AGENT', departments[0]), customer = await person('CUSTOMER', departments[0]), foreign = await person('AGENT', departments[1]);
    const created = await createConversation(admin, { customerId: customer.id, source: 'PHONE_SUPPORT', channel: 'TICKET', subject: 'x', message: 'Test request', departmentId: departments[0], priority: 'NORMAL', assignedAgentIds: [a.id, b.id] });
    conversations.push(created.id);
    assert.deepEqual(new Set(created.assignees.map(item => item.userId)), new Set([a.id, b.id]));
    const ownB = { ...b, roleScope: 'OWN' };
    assert.equal((await getConversation(ownB, created.id)).id, created.id);
    const mine = await listConversations(ownB, listSchema.parse({ category: 'MINE', search: 'x' }));
    assert(mine.data.some(item => item.id === created.id));
    await addMessage(admin, created.id, { body: 'Manager reply' });
    await addMessage(b, created.id, { body: 'Agent reply' });
    assert.equal((await getConversation(admin, created.id)).assignees.length, 3);
    const idsBeforeNote = (await getConversation(admin, created.id)).assignees.map(item => item.userId);
    await addMessage(admin, created.id, { body: 'Internal note', type: 'INTERNAL_NOTE' });
    await addMessage(customer, created.id, { body: 'Customer reply', type: 'CUSTOMER_MESSAGE' });
    assert.deepEqual((await getConversation(admin, created.id)).assignees.map(item => item.userId), idsBeforeNote);
    await assert.rejects(addMessage(foreign, created.id, { body: 'Unauthorized reply' }));
    assert.equal((await getConversation(admin, created.id)).assignees.length, 3);
    await updateConversation(admin, created.id, { assignedAgentIds: [] });
    assert.equal((await getConversation(admin, created.id)).assignedAgentId, null);
    assert.equal((await getConversation(admin, created.id)).assignees.length, 0);
    await assert.rejects(getConversation(ownB, created.id));
    await assert.rejects(addMessage(ownB, created.id, { body: 'Hidden conversation cannot auto-assign me' }));
    // Department-visible agents can reply without first replacing another agent.
    await Promise.all([addMessage(a, created.id, { body: 'First concurrent reply' }), addMessage(b, created.id, { body: 'Second concurrent reply' })]);
    assert.deepEqual(new Set((await getConversation(admin, created.id)).assignees.map(item => item.userId)), new Set([a.id, b.id]));
    const directory = await departmentAgents(admin, departments[0], { page: 1, limit: 100 });
    assert.equal(directory.data.find(item => item.id === b.id)?.openConversationCount, 1);
    const report = await reports(admin, { page: 1, limit: 100, departmentId: departments[0], days: 7 });
    assert.equal(report.total, 1);
    assert.equal(report.departments.find(item => item.id === departments[0])?.statuses.OPEN, 1);
    assert.equal(report.staff.find(item => item.id === b.id)?.assigned, 1);
    await assert.rejects(deleteUser(admin, b.id), error => (error as { code?: string }).code === 'ASSIGNMENTS_EXIST');
    await deleteUser(admin, b.id, { assignmentTransfers: [{ conversationIds: [created.id], departmentId: departments[0], assignedAgentId: admin.id }] });
    assert.deepEqual(new Set((await getConversation(admin, created.id)).assignees.map(item => item.userId)), new Set([a.id, admin.id]));
    await assert.rejects(updateConversation(admin, created.id, { assignedAgentIds: [a.id, foreign.id] }));
    assert.equal((await getConversation(admin, created.id)).assignees.length, 2);
    await updateConversation(admin, created.id, { departmentId: departments[1] });
    assert.equal((await getConversation(admin, created.id)).assignees.length, 0);
  } finally {
    await db.notification.deleteMany({ where: { OR: [{ conversationId: { in: conversations } }, { userId: { in: users } }] } });
    await db.activityLog.deleteMany({ where: { OR: [{ entityId: { in: conversations } }, { userId: { in: users } }] } });
    await db.conversationMessage.deleteMany({ where: { conversationId: { in: conversations } } });
    await db.conversation.deleteMany({ where: { id: { in: conversations } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.department.deleteMany({ where: { id: { in: departments } } });
    await db.$disconnect();
  }
});
