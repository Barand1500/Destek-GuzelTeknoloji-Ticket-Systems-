import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { listConversations } from '../src/services/conversations.service.js';
import { conversationChannels } from '../../frontend/src/utils/conversation-channels.ts';

test('inbox labels use current channel selection and retain legacy fallback', () => {
  assert.deepEqual(conversationChannels({ channel: 'WHATSAPP', replyChannels: ['EMAIL'] }), ['EMAIL']);
  assert.deepEqual(conversationChannels({ channel: 'WHATSAPP', replyChannels: ['WHATSAPP', 'EMAIL'] }), ['WHATSAPP', 'EMAIL']);
  assert.deepEqual(conversationChannels({ channel: 'WHATSAPP', replyChannels: null }), ['WHATSAPP']);
  assert.deepEqual(conversationChannels({ channel: 'EMAIL', replyChannels: [] }), ['EMAIL']);
});

test('channel categories, explicit filters and search follow current selections before pagination', async () => {
  const suffix = randomUUID(), ids: string[] = [];
  let customerId = '', departmentId = '';
  try {
    const customer = await db.user.create({ data: { name: `Channel listing ${suffix}`, role: 'CUSTOMER', passwordHash: 'test-only' } }); customerId = customer.id;
    const department = await db.department.create({ data: { name: `Channel listing ${suffix}` } }); departmentId = department.id;
    const changed = await db.conversation.create({ data: { customerId, departmentId, channel: 'WHATSAPP', replyChannels: ['EMAIL'], subject: 'A changed', searchSubject: 'a changed' } }); ids.push(changed.id);
    const multi = await db.conversation.create({ data: { customerId, departmentId, channel: 'WHATSAPP', replyChannels: ['WHATSAPP', 'EMAIL'], subject: 'B multi', searchSubject: 'b multi' } }); ids.push(multi.id);
    const legacy = await db.conversation.create({ data: { customerId, departmentId, channel: 'WHATSAPP', subject: 'C legacy', searchSubject: 'c legacy' } }); ids.push(legacy.id);
    const empty = await db.conversation.create({ data: { customerId, departmentId, channel: 'EMAIL', replyChannels: [], subject: 'D empty', searchSubject: 'd empty' } }); ids.push(empty.id);
    const jsonNull = await db.conversation.create({ data: { customerId, departmentId, channel: 'EMAIL', replyChannels: Prisma.JsonNull, subject: 'E null', searchSubject: 'e null' } }); ids.push(jsonNull.id);
    const actor = { id: randomUUID(), name: 'Admin', email: '', role: 'ADMIN' as const, departmentIds: [], sessionId: 'test' };
    const query = { page: 1, limit: 100, view: 'all' as const, customerId };
    const matches = async (extra: object) => new Set((await listConversations(actor, { ...query, ...extra })).data.map(item => item.id));
    assert.deepEqual(await matches({ category: 'EMAIL' }), new Set([changed.id, multi.id, empty.id, jsonNull.id]));
    assert.deepEqual(await matches({ category: 'WHATSAPP' }), new Set([multi.id, legacy.id]));
    assert.deepEqual(await matches({ channel: 'EMAIL' }), new Set([changed.id, multi.id, empty.id, jsonNull.id]));
    assert.deepEqual(await matches({ channel: 'WHATSAPP' }), new Set([multi.id, legacy.id]));
    assert.deepEqual(await matches({ search: 'E-Posta' }), new Set([changed.id, multi.id, empty.id, jsonNull.id]));
    assert.deepEqual(await matches({ search: 'WhatsApp' }), new Set([multi.id, legacy.id]));
    const first = await listConversations(actor, { ...query, category: 'EMAIL', limit: 1, sortBy: 'subject', sortDirection: 'asc' });
    assert.equal(first.data[0].id, changed.id);
    assert.equal(first.pagination.total, 4);
    assert.equal((await listConversations(actor, { ...query, limit: 1, sortBy: 'number', sortDirection: 'asc' })).data[0].id, changed.id);
    assert.equal((await listConversations(actor, { ...query, limit: 1, sortBy: 'number', sortDirection: 'desc' })).data[0].id, jsonNull.id);
    assert.equal((await listConversations(actor, { ...query, page: 2, limit: 1, sortBy: 'number', sortDirection: 'asc' })).data[0].id, multi.id);
    await db.conversation.update({ where: { id: changed.id }, data: { replyChannels: ['TICKET'] } });
    assert.deepEqual(await matches({ category: 'TICKET' }), new Set([changed.id]));
    assert.equal((await matches({ category: 'EMAIL' })).has(changed.id), false);
    assert.equal((await listConversations({ ...actor, role: 'CUSTOMER' }, { ...query, category: 'EMAIL' })).pagination.total, 0);
    // Reproduce an originally-email request moved to WhatsApp after creation.
    await db.conversation.update({ where: { id: empty.id }, data: { replyChannels: ['WHATSAPP'] } });
    assert.equal((await matches({ category: 'EMAIL' })).has(empty.id), false);
    assert.equal((await matches({ channel: 'EMAIL' })).has(empty.id), false);
    assert.equal((await matches({ category: 'WHATSAPP' })).has(empty.id), true);
    assert.equal((await matches({ channel: 'WHATSAPP' })).has(empty.id), true);
    const moved = (await listConversations(actor, { ...query, category: 'WHATSAPP' })).data.find(item => item.id === empty.id)!;
    assert.deepEqual(conversationChannels(moved), ['WHATSAPP']);
    await db.conversation.update({ where: { id: empty.id }, data: { replyChannels: ['EMAIL', 'WHATSAPP'] } });
    assert.equal((await matches({ category: 'EMAIL' })).has(empty.id), true);
    assert.equal((await matches({ category: 'WHATSAPP' })).has(empty.id), true);
  } finally {
    await db.conversation.deleteMany({ where: { id: { in: ids } } });
    if (customerId) await db.user.delete({ where: { id: customerId } });
    if (departmentId) await db.department.delete({ where: { id: departmentId } });
    await db.$disconnect();
  }
});
