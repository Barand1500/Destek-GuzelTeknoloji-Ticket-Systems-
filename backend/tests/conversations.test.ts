import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';
const { app } = await import('../src/app.js');
const { db } = await import('../src/config/db.js');

test('Conversation channels, atomic claims, inbox views and message roles', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const suffix = randomUUID(), password = `Test-${randomUUID()}`;
  const hash = await bcrypt.hash(password, 12);
  const users: string[] = [], departments: string[] = [], conversations: string[] = [];
  async function request(url: string, token: string, method = 'GET', body?: unknown) {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, json: await response.json() };
  }
  async function user(role: 'CUSTOMER' | 'AGENT' | 'ADMIN', departmentId?: string) {
    const record = await db.user.create({ data: { name: 'Conversation test', email: `${randomUUID()}@example.test`, passwordHash: hash, role, ...(departmentId ? { departments: { create: { departmentId } } } : {}) } });
    users.push(record.id);
    const login = await request('/auth/login', '', 'POST', { email: record.email, password });
    assert.equal(login.status, 200);
    return { id: record.id, token: login.json.data.accessToken as string };
  }
  try {
    const department = await db.department.create({ data: { name: `Conversation ${suffix}` } });
    const outside = await db.department.create({ data: { name: `Outside ${suffix}` } });
    departments.push(department.id, outside.id);
    const customer = await user('CUSTOMER'), admin = await user('ADMIN');
    const first = await user('AGENT', department.id), second = await user('AGENT', department.id), foreign = await user('AGENT', outside.id);
    const input = { subject: 'Unified conversation test', message: 'Customer request', departmentId: department.id, priority: 'URGENT' };
    let id = '', winner = first, loser = second;
    await t.test('only TICKET creation is enabled and original ticket endpoint remains compatible', async () => {
      for (const channel of ['EMAIL', 'LIVE_CHAT']) assert.equal((await request('/conversations', customer.token, 'POST', { ...input, channel })).status, 400);
      const created = await request('/conversations', customer.token, 'POST', input);
      assert.equal(created.status, 201);
      id = created.json.data.id; conversations.push(id);
      assert.equal(created.json.data.channel, 'TICKET');
      assert.equal(created.json.data.assignedAgentId, null);
      assert.equal((await request(`/tickets/${id}`, customer.token)).status, 200);
      const messages = await request(`/conversations/${id}/messages`, customer.token);
      assert.equal(messages.json.data[0].type, 'CUSTOMER_MESSAGE');
    });
    await t.test('department queue can be read but cannot be changed before claiming', async () => {
      assert.equal((await request(`/conversations/${id}`, first.token)).status, 200);
      assert.equal((await request(`/conversations/${id}`, foreign.token)).status, 404);
      assert.equal((await request(`/conversations/${id}/messages`, first.token, 'POST', { body: 'Premature reply' })).status, 409);
      assert.notEqual((await request(`/conversations/${id}`, first.token, 'PATCH', { status: 'CLOSED' })).status, 200);
      for (const token of [customer.token, foreign.token]) assert.notEqual((await request(`/conversations/${id}/assign-to-me`, token, 'POST', {})).status, 200);
    });
    await t.test('two simultaneous claims have exactly one winner and one conflict', async () => {
      const outcomes = await Promise.all([first, second].map(actor => request(`/conversations/${id}/assign-to-me`, actor.token, 'POST', {})));
      assert.deepEqual(outcomes.map(r => r.status).sort(), [200, 409]);
      [winner, loser] = outcomes[0].status === 200 ? [first, second] : [second, first];
      assert.equal((await db.conversation.findUniqueOrThrow({ where: { id } })).assignedAgentId, winner.id);
      assert.equal((await request(`/conversations/${id}`, loser.token)).status, 404);
      const system = await db.conversationMessage.findMany({ where: { conversationId: id, type: 'SYSTEM' } });
      assert.equal(system.length, 1);
    });
    await t.test('all inbox views use current assignment, status and priority', async () => {
      for (const view of ['all', 'mine', 'open', 'urgent']) {
        const list = await request(`/conversations?view=${view}`, winner.token);
        assert.equal(list.status, 200);
        assert.ok(list.json.data.some((row: { id: string }) => row.id === id));
      }
      for (const view of ['unassigned', 'pending', 'resolved', 'closed']) {
        const list = await request(`/conversations?view=${view}`, winner.token);
        assert.equal(list.status, 200);
        assert.ok(!list.json.data.some((row: { id: string }) => row.id === id));
      }
      await request(`/conversations/${id}`, winner.token, 'PATCH', { status: 'PENDING' });
      assert.ok((await request('/conversations?view=pending', winner.token)).json.data.some((row: { id: string }) => row.id === id));
    });
    await t.test('message types cannot spoof another role or system; internal notes never reach customers', async () => {
      assert.equal((await request(`/conversations/${id}/messages`, winner.token, 'POST', { body: 'Fake system', type: 'SYSTEM' })).status, 400);
      for (const type of ['AGENT_REPLY', 'INTERNAL_NOTE']) assert.equal((await request(`/conversations/${id}/messages`, customer.token, 'POST', { body: 'Spoof', type })).status, 403);
      assert.equal((await request(`/conversations/${id}/messages`, winner.token, 'POST', { body: 'Customer spoof', type: 'CUSTOMER_MESSAGE' })).status, 403);
      assert.equal((await request(`/conversations/${id}/messages`, winner.token, 'POST', { body: 'Private', type: 'INTERNAL_NOTE' })).status, 201);
      assert.equal((await db.conversation.findUniqueOrThrow({ where: { id } })).firstResponseAt, null);
      assert.equal((await request(`/conversations/${id}/messages`, winner.token, 'POST', { body: 'Public', type: 'AGENT_REPLY' })).status, 201);
      const visible = await request(`/conversations/${id}/messages`, customer.token);
      assert.ok(visible.json.data.every((message: { type: string }) => message.type !== 'INTERNAL_NOTE'));
      assert.ok(visible.json.data.some((message: { type: string }) => message.type === 'AGENT_REPLY'));
      assert.ok((await db.conversation.findUniqueOrThrow({ where: { id } })).firstResponseAt);
      const history = await request(`/conversations/${id}/history`, winner.token);
      assert.equal(history.status, 200);
      assert.ok(history.json.data.some((entry: { type: string; body: string; author: { id: string }; createdAt: string }) => entry.type === 'INTERNAL_NOTE' && entry.body === 'Private' && entry.author.id === winner.id && Boolean(entry.createdAt)));
      assert.ok(history.json.data.some((entry: { type: string }) => entry.type === 'AGENT_REPLY'));
      assert.ok(history.json.data.some((entry: { action: string }) => entry.action === 'conversation.created'));
      assert.equal((await request(`/conversations/${id}/history`, customer.token)).status, 403);
      assert.equal((await request(`/conversations/${id}/history`, foreign.token)).status, 404);
      const secondPage = await request(`/conversations/${id}/history?page=2&limit=1`, winner.token);
      assert.equal(secondPage.json.data.length, 1);
      assert.equal(secondPage.json.data[0].id, history.json.data[1].id);
      assert.equal((await request('/users', customer.token)).status, 403);
      assert.equal((await request('/users', winner.token)).status, 403);
      assert.equal((await request('/users', admin.token)).status, 200);
    });
  } finally {
    try {
      await db.activityLog.deleteMany({ where: { userId: { in: users } } });
      await db.conversationMessage.deleteMany({ where: { conversationId: { in: conversations } } });
      await db.conversation.deleteMany({ where: { id: { in: conversations } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.department.deleteMany({ where: { id: { in: departments } } });
    } finally {
      await db.$disconnect();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }
});
