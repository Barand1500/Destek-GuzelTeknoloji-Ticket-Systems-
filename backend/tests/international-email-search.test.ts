import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import { canonicalEmail } from '../src/utils/email.js';
import { internationalEmailSearchIds } from '../src/services/email-search.js';
import { users } from '../src/services/management.service.js';
import { listConversations } from '../src/services/conversations.service.js';
import { directoryQuery } from '../src/validators/management.js';

test('readable partial IDN email search finds main and extra addresses before pagination and keeps visibility filters', async () => {
  let customerId = '', departmentId = '', conversationId = '';
  const suffix = randomUUID();
  try {
    const person = await db.user.create({ data: { name: `IDN search ${suffix}`, email: canonicalEmail(`baran-${suffix}@güzelteknoloji.com`), extraEmails: canonicalEmail(`alias-${suffix}@ışık.com`), role: 'CUSTOMER', passwordHash: 'test-only' } });
    customerId = person.id;
    const department = await db.department.create({ data: { name: `IDN search ${suffix}` } }); departmentId = department.id;
    const ticket = await db.conversation.create({ data: { customerId, departmentId, subject: `IDN search ${suffix}`, searchSubject: 'idn search', channel: 'EMAIL', replyChannels: ['EMAIL'] } }); conversationId = ticket.id;
    const actor = { id: randomUUID(), name: 'Admin', email: '', role: 'ADMIN' as const, departmentIds: [], sessionId: 'test' };
    const query = { page: 1, limit: 1, view: 'all' as const, customerId };
    for (const search of [`baran-${suffix}@gü`, `baran-${suffix}@g`, `BARAN-${suffix.toUpperCase()}@GÜ`, `alias-${suffix}@ış`, person.email!]) {
      assert.ok((await internationalEmailSearchIds(search)).includes(customerId) || search === person.email);
      const directory = await users(actor, directoryQuery.parse({ id: customerId, search, limit: 1 }), true);
      assert.equal(directory.data[0]?.id, customerId, search);
      assert.equal(directory.pagination.total, 1);
      const inbox = await listConversations(actor, { ...query, search, category: 'EMAIL' });
      assert.equal(inbox.data[0]?.id, conversationId, search);
      assert.equal(inbox.pagination.total, 1);
      assert.equal((await listConversations(actor, { ...query, search, category: 'WHATSAPP' })).pagination.total, 0);
      assert.equal((await listConversations({ ...actor, role: 'CUSTOMER' }, { ...query, search })).pagination.total, 0);
    }
    const search = `baran-${suffix}@gü`;
    assert.equal((await users(actor, directoryQuery.parse({ id: customerId, search, page: 2, limit: 1 }), true)).data.length, 0);
    assert.equal((await listConversations(actor, { ...query, search, page: 2 })).data.length, 0);
  } finally {
    if (conversationId) await db.conversation.delete({ where: { id: conversationId } });
    if (customerId) await db.user.delete({ where: { id: customerId } });
    if (departmentId) await db.department.delete({ where: { id: departmentId } });
    await db.$disconnect();
  }
});
