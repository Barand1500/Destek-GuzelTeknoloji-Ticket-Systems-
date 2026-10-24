import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { app } from '../src/app.js';
import { issueFormEmailSession, listFormTickets, authorizeForm, formTokenHash } from '../src/services/form-access.service.js';
import { verifyFormLogin } from '../src/services/form-login.service.js';
import { history, listConversations } from '../src/services/conversations.service.js';
import type { AddressInfo } from 'node:net';

test('verified email and SMS portal sessions list and reply across channels without exposing notes or other customers', async () => {
  const suffix = randomUUID(), email = `portal-${suffix}@example.invalid`, phone = '05' + String(parseInt(suffix.slice(0, 8), 16)).padStart(9, '0').slice(-9);
  const department = await db.department.create({ data: { name: `Portal ${suffix}` } });
  const customer = await db.user.create({ data: { name: 'Portal customer', email, phone, role: 'CUSTOMER', passwordHash: 'test' } });
  const other = await db.user.create({ data: { name: 'Other customer', email: `other-${email}`, phone: '0533 111 22 33', role: 'CUSTOMER', passwordHash: 'test' } });
  const ids: string[] = [], tokens: string[] = [];
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/public/form`;
  try {
    for (const channel of ['FORM', 'EMAIL', 'SMS', 'WHATSAPP', 'TICKET', 'LIVE_CHAT'] as const) {
      const ticket = await db.conversation.create({ data: { subject: channel, searchSubject: channel, channel, customerId: customer.id, departmentId: department.id,
        messages: { create: [{ authorId: customer.id, body: 'Public answer', type: 'AGENT_REPLY', visibleInForm: false }, { authorId: customer.id, body: 'SECRET NOTE', type: 'INTERNAL_NOTE' }] },
        ...(channel === 'FORM' ? { formRequest: { create: { name: 'Submitted', email: `old-${email}`, phone: '0534 111 22 33' } } } : {}) } });
      ids.push(ticket.id);
    }
    const stranger = await db.conversation.create({ data: { subject: 'Private', searchSubject: 'private', channel: 'EMAIL', customerId: other.id, departmentId: department.id } });
    ids.push(stranger.id);
    const listed = await listConversations({ id: customer.id, name: customer.name, email, role: 'ADMIN', departmentIds: [], sessionId: '' }, { customerId: customer.id, page: 1, limit: 15, view: 'all' });
    assert.equal(listed.data.length, 6);
    assert(listed.data.every(ticket => ticket.firstMessage === 'Public answer'));
    for (const deliveryChannel of ['EMAIL', 'SMS']) {
      const token = await db.$transaction(tx => issueFormEmailSession(tx, deliveryChannel === 'EMAIL' ? email : null, deliveryChannel === 'SMS' ? '9' + phone : null, deliveryChannel));
      tokens.push(token);
      const session = { email: deliveryChannel === 'EMAIL' ? email : null, phone: deliveryChannel === 'SMS' ? '9' + phone : null, deliveryChannel };
      assert.deepEqual(new Set((await listFormTickets(session)).map(t => t.id)), new Set(ids.slice(0, 6)));
      await assert.rejects(authorizeForm(token, stranger.id));
      for (const id of ids.slice(0, 6)) {
        assert.equal((await authorizeForm(token, id)).id, id);
        const headers = { 'x-form-token': token, 'x-form-conversation': id };
        const response = await fetch(`${base}/conversation`, { headers });
        assert.equal(response.status, 200);
        const body = await response.text();
        assert(body.includes('Public answer')); assert(!body.includes('SECRET NOTE'));
        const payload = new FormData(); payload.set('body', `Portal reply ${deliveryChannel}`);
        assert.equal((await fetch(`${base}/conversation/messages`, { method: 'POST', headers, body: payload })).status, 201);
        const updated = await db.conversation.findUniqueOrThrow({ where: { id } });
        assert(((updated.replyChannels as string[] | null) ?? [updated.channel]).includes('FORM'));
        assert.equal(updated.channel, ['FORM', 'EMAIL', 'SMS', 'WHATSAPP', 'TICKET', 'LIVE_CHAT'][ids.indexOf(id)]);
        const audit = await history({ id: customer.id, name: customer.name, email, role: 'ADMIN', departmentIds: [], sessionId: '' }, id, 1, 50);
        const reply = audit.data.find(entry => entry.body === `Portal reply ${deliveryChannel}`);
        assert.equal((reply?.metadata as { channel?: string })?.channel, 'FORM');
      }
      // A non-FORM challenge must also verify for both identities.
      const challengeId = randomUUID(), code = '123456';
      await db.formLoginChallenge.create({ data: { id: challengeId, conversationId: ids[1], ...session,
        codeHash: createHmac('sha256', env.JWT_ACCESS_SECRET).update(`form-login:${challengeId}:${code}`).digest('hex'), expiresAt: new Date(Date.now() + 60_000) } });
      const verified = await verifyFormLogin(challengeId, code); tokens.push(verified.token);
      assert.equal((await authorizeForm(verified.token, ids[1])).id, ids[1]);
      await assert.rejects(verifyFormLogin(challengeId, code));
      await db.formLoginChallenge.deleteMany({ where: { conversationId: ids[1] } });
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.formEmailSession.deleteMany({ where: { tokenHash: { in: tokens.map(formTokenHash) } } });
    await db.notification.deleteMany({ where: { conversationId: { in: ids } } });
    await db.activityLog.deleteMany({ where: { entityId: { in: ids } } });
    await db.formLoginChallenge.deleteMany({ where: { conversationId: { in: ids } } });
    await db.formRequest.deleteMany({ where: { conversationId: { in: ids } } });
    await db.conversationMessage.deleteMany({ where: { conversationId: { in: ids } } });
    await db.conversation.deleteMany({ where: { id: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: [customer.id, other.id] } } });
    await db.department.delete({ where: { id: department.id } });
    await db.$disconnect();
  }
});
