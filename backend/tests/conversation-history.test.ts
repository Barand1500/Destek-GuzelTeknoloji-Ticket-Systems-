import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import { history } from '../src/services/conversations.service.js';

test('history hydrates only mixed page rows and retains original author and late-page metadata', async () => {
  const suffix = randomUUID();
  const department = { id: randomUUID() };
  const customer = { id: randomUUID(), name: 'History customer' };
  const staff = { id: randomUUID(), name: 'History creator' };
  const ticket = { id: randomUUID() };
  const actor = { id: staff.id, name: staff.name, email: '', role: 'ADMIN' as const, departmentIds: [], sessionId: '' };
  const ids = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'].map(id => `${suffix.slice(0, 8)}${id.slice(8)}`);
  const at = new Date('2026-01-01T00:00:00Z');
  const original = db.$transaction.bind(db);
  try {
    await db.department.create({ data: { id: department.id, name: `History ${suffix}` } });
    await db.user.create({ data: { ...customer, role: 'CUSTOMER', passwordHash: 'test' } });
    await db.user.create({ data: { ...staff, role: 'ADMIN', passwordHash: 'test' } });
    await db.conversation.create({ data: { id: ticket.id, subject: suffix, searchSubject: suffix, departmentId: department.id, customerId: customer.id } });
    await db.conversationMessage.createMany({ data: ids.map((id, i) => ({ id, conversationId: ticket.id, authorId: customer.id, body: `message ${i}`, createdAt: i === 0 ? new Date(at.getTime() - 1000) : at })) });
    const creation = await db.activityLog.create({ data: { entityId: ticket.id, userId: staff.id, action: 'conversation.created', createdAt: new Date(at.getTime() - 2000) } });
    const update = await db.activityLog.create({ data: { id: `${suffix.slice(0, 8)}-0000-0000-0000-000000000004`, entityId: ticket.id, userId: staff.id, action: 'conversation.updated', createdAt: at } });
    for (const action of ['conversation.email_received', 'conversation.email_sent', 'conversation.replied', 'conversation.note_added']) {
      await db.activityLog.create({ data: { entityId: ticket.id, userId: staff.id, action, metadata: { messageId: ids[0], channel: 'FORM', replyChannels: ['EMAIL'] } } });
    }
    // A real transaction guard catches accidental full-history hydration before it allocates rows.
    db.$transaction = ((work: any, options: any) => original(async tx => {
      for (const model of [tx.conversationMessage, tx.activityLog]) {
        const find = model.findMany.bind(model) as any;
        (model as any).findMany = (args: any) => {
          assert.ok(args?.take || args?.where?.id?.in, 'history must bound every hydrated findMany');
          return find(args);
        };
      }
      assert.equal(options.isolationLevel, 'RepeatableRead');
      return work(tx);
    }, options)) as typeof db.$transaction;
    const first = await history(actor, ticket.id, 1, 2);
    const second = await history(actor, ticket.id, 2, 2);
    const third = await history(actor, ticket.id, 3, 2);
    assert.deepEqual([...first.data, ...second.data, ...third.data].map(row => row.id), [update.id, ids[2], ids[1], ids[0], creation.id]);
    assert.deepEqual(first.pagination, { page: 1, limit: 2, total: 5, totalPages: 3 });
    const initial = second.data[1];
    assert.equal(initial.action, 'INITIAL_MESSAGE');
    assert.equal(initial.author.id, staff.id);
    assert.deepEqual(initial.metadata, { channel: 'FORM', replyChannels: ['EMAIL'] });
    assert.deepEqual((await history(actor, ticket.id, 99, 2)).data, []);
    // Table-local IDs may collide: both rows must survive a one-row page boundary.
    await db.activityLog.create({ data: { id: ids[2], entityId: ticket.id, userId: staff.id, action: 'conversation.claimed', createdAt: at } });
    const collisionMessage = await history(actor, ticket.id, 2, 1);
    const collisionLog = await history(actor, ticket.id, 3, 1);
    assert.equal(collisionMessage.data[0].id, ids[2]);
    assert.equal(collisionMessage.data[0].action, 'CUSTOMER_MESSAGE');
    assert.equal(collisionLog.data[0].id, ids[2]);
    assert.equal(collisionLog.data[0].action, 'conversation.claimed');
    assert.equal(collisionLog.pagination.total, 6);
    await db.activityLog.delete({ where: { id: creation.id } });
    const legacy = await history(actor, ticket.id, 5, 1);
    assert.equal(legacy.data[0].id, ids[0]);
    assert.equal(legacy.data[0].action, 'CUSTOMER_MESSAGE');
    assert.equal(legacy.data[0].author.id, customer.id);
    await assert.rejects(history({ ...actor, role: 'CUSTOMER', id: customer.id }, ticket.id, 1, 2), { code: 'FORBIDDEN' });
    await assert.rejects(history({ ...actor, role: 'SUPERVISOR' }, ticket.id, 1, 2), { code: 'TICKET_NOT_FOUND' });
  } finally {
    db.$transaction = original;
    await db.activityLog.deleteMany({ where: { entityId: ticket.id } });
    await db.conversationMessage.deleteMany({ where: { conversationId: ticket.id } });
    await db.conversation.deleteMany({ where: { id: ticket.id } });
    await db.user.deleteMany({ where: { id: { in: [customer.id, staff.id] } } });
    await db.department.deleteMany({ where: { id: department.id } });
    await db.$disconnect();
  }
});

