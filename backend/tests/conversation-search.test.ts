import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import { listConversations } from '../src/services/conversations.service.js';
import { ticketNumberSearch, phoneSearchValues } from '../src/services/conversation-search.js';

test('ticket number search accepts copied identifiers and padded prefixes without extracting digits from ordinary text', () => {
  for (const search of ['14', '00014', '#TK-00014', 'TK-00014', 'tk 00014', '#14', ' TK - 00014 ']) assert.deepEqual(ticketNumberSearch(search), [{ number: 14 }]);
  assert.deepEqual(ticketNumberSearch('#TK-000'), [{ number: { gte: 1, lte: 99 } }]);
  assert.deepEqual(ticketNumberSearch('#TK-0001'), [{ number: 1 }, { number: { gte: 10, lte: 19 } }]);
  assert.deepEqual(ticketNumberSearch('Anypay7'), []);
  assert.deepEqual(ticketNumberSearch('customer14@example.test'), []);
  assert.deepEqual(ticketNumberSearch(''), []);
  assert.deepEqual(ticketNumberSearch('9999999999999999999'), []);
  assert.ok(phoneSearchValues('+90 541 258 44 72').includes('0541 258 44 72'));
  assert.ok(phoneSearchValues('0541 258 44 72').includes('905412584472'));
});

test('general inbox search finds ticket, contact, department, message and displayed labels before pagination without leaking private records', async () => {
  const suffix = randomUUID();
  const people: string[] = [], departments: string[] = [], conversations: string[] = [];
  let websiteId = '', tagId = '', statusId = '', priorityId = '';
  try {
    const customer = await db.user.create({ data: { name: `Müşteri ${suffix}`, email: `${suffix}@example.test`, phone: '905412584472', extraEmails: `extra-${suffix}@example.test`, extraPhones: '0530 411 21 50', company: `Şirket ${suffix}`, role: 'CUSTOMER', passwordHash: 'test-only' } }); people.push(customer.id);
    const staff = await db.user.create({ data: { name: `Personel ${suffix}`, role: 'ADMIN', passwordHash: 'test-only' } }); people.push(staff.id);
    const department = await db.department.create({ data: { name: `Departman ${suffix}` } }); departments.push(department.id);
    const outside = await db.department.create({ data: { name: `Diğer ${suffix}` } }); departments.push(outside.id);
    const website = await db.website.create({ data: { name: `Proje ${suffix}`, url: `https://${suffix}.example.test` } }); websiteId = website.id;
    const tag = await db.tag.create({ data: { name: `Etiket ${suffix}`, code: `TAG_${suffix.slice(0, 8)}` } }); tagId = tag.id;
    const status = await db.statusOption.create({ data: { name: `Özel Durum ${suffix}`, code: `STATUS_${suffix.slice(0, 8)}` } }); statusId = status.id;
    const priority = await db.priorityOption.create({ data: { name: `Özel Öncelik ${suffix}`, code: `PRIORITY_${suffix.slice(0, 8)}` } }); priorityId = priority.id;
    const conversation = await db.conversation.create({ data: { customerId: customer.id, assignedAgentId: staff.id, departmentId: department.id, websiteId, subject: `Kırık ekran ${suffix}`, searchSubject: '', status: status.code, priority: priority.code, channel: 'EMAIL', tags: { create: { tagId } }, messages: { create: [
      { authorId: customer.id, type: 'CUSTOMER_MESSAGE', body: `Mesaj içeriği ${suffix}` },
      { authorId: staff.id, type: 'INTERNAL_NOTE', body: `Gizli not ${suffix}` },
    ] } } }); conversations.push(conversation.id);
    const hidden = await db.conversation.create({ data: { customerId: customer.id, departmentId: outside.id, subject: 'Other department record', searchSubject: 'other department record' } }); conversations.push(hidden.id);
    const actor = { id: staff.id, name: staff.name, email: '', role: 'ADMIN' as const, departmentIds: [department.id], sessionId: 'test' };
    const q = { page: 1, limit: 1, view: 'all' as const, customerId: customer.id };
    const padded = String(conversation.number).padStart(5, '0');
    for (const search of [String(conversation.number), padded, `#TK-${padded}`, `tk-${padded}`, `#TK-${padded.slice(0, -1)}`, `Kırık ekran ${suffix}`, customer.name, customer.email!, `extra-${suffix}@example.test`, '0541 258 44 72', '5412584472', '905304112150', customer.company!, staff.name, department.name, website.name, tag.name, tag.code, status.name, priority.name, `Mesaj içeriği ${suffix}`, `Gizli not ${suffix}`, 'E-Posta']) {
      const result = await listConversations(actor, { ...q, limit: 100, search });
      assert.ok(result.data.some(item => item.id === conversation.id), `missing search result for ${search}`);
    }
    const first = await listConversations(actor, { ...q, search: suffix });
    const second = await listConversations(actor, { ...q, page: 2, search: suffix });
    assert.equal(first.pagination.total, 2);
    assert.notEqual(first.data[0].id, second.data[0].id);
    assert.equal((await listConversations(actor, { ...q, search: `#TK-${padded}`, status: 'NON_MATCHING_STATUS' })).pagination.total, 0);
    assert.equal((await listConversations({ ...actor, role: 'AGENT' }, { ...q, search: `#TK-${String(hidden.number).padStart(5, '0')}` })).pagination.total, 0);
    assert.equal((await listConversations({ ...actor, id: customer.id, role: 'CUSTOMER' }, { ...q, search: `Gizli not ${suffix}` })).pagination.total, 0);
    assert.equal((await listConversations({ ...actor, id: customer.id, role: 'CUSTOMER' }, { ...q, search: `Mesaj içeriği ${suffix}` })).data[0].id, conversation.id);
  } finally {
    await db.conversationMessage.deleteMany({ where: { conversationId: { in: conversations } } });
    await db.conversationTag.deleteMany({ where: { conversationId: { in: conversations } } });
    await db.conversation.deleteMany({ where: { id: { in: conversations } } });
    await db.user.deleteMany({ where: { id: { in: people } } });
    await db.department.deleteMany({ where: { id: { in: departments } } });
    if (websiteId) await db.website.delete({ where: { id: websiteId } });
    if (tagId) await db.tag.delete({ where: { id: tagId } });
    if (statusId) await db.statusOption.delete({ where: { id: statusId } });
    if (priorityId) await db.priorityOption.delete({ where: { id: priorityId } });
    await db.$disconnect();
  }
});
