import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { AddressInfo } from 'node:net';
process.env.NODE_ENV = 'test';
const { app } = await import('../src/app.js');
const { db } = await import('../src/config/db.js');
test('roles: API permissions, live changes, account protection and role deletion', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  const prefix = randomUUID(), password = `Role-${randomUUID()}`, hash = await bcrypt.hash(password, 12);
  const users: string[] = [], roles: string[] = [];
  const departments: string[] = [], conversations: string[] = [];
  async function request(path: string, token = '', method = 'GET', body?: unknown) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  }
  async function account(name: string, role: 'ADMIN' | 'AGENT', accessRoleId?: string) {
    const email = `${name}-${prefix}@example.test`;
    const user = await db.user.create({ data: { name, role, email, loginEmail: email, passwordHash: hash, accessRoleId } });
    users.push(user.id);
    const response = await request('/auth/login', '', 'POST', { email, password });
    assert.equal(response.status, 200);
    return { id: user.id, token: response.body.data.accessToken };
  }
  try {
    const admin = await account('system', 'ADMIN');
    const agent = await account('agent', 'AGENT');
    assert.equal((await request('/roles', agent.token)).status, 403);
    const input = { name: `Reports-${prefix}`, description: 'Report-only test role', scope: 'ALL', permissions: ['reports.view'] };
    const created = await request('/roles', admin.token, 'POST', input);
    assert.equal(created.status, 201);
    const roleId = created.body.data.id; roles.push(roleId);
    const reader = await account('reader', 'ADMIN', roleId);
    const me = await request('/auth/me', reader.token);
    assert.equal(me.body.data.accessRole.id, roleId);
    assert.equal((await request('/reports', reader.token)).status, 200);
    assert.equal((await request('/customers', reader.token)).status, 403);
    assert.equal((await request('/conversations', reader.token)).status, 403);
    assert.equal((await request('/roles', reader.token)).status, 403);
    assert.equal((await request('/integrations', reader.token)).status, 403);
    assert.equal((await request('/roles/' + roleId, admin.token, 'DELETE')).status, 409);
    assert.equal((await request('/roles/' + roleId, admin.token, 'PATCH', { ...input, permissions: ['customers.delete'] })).status, 400);
    assert.equal((await request('/roles/' + roleId, admin.token, 'PATCH', { ...input, permissions: ['users.view', 'users.update', 'customers.view'] })).status, 200);
    // The same access token must see changed role permissions immediately.
    assert.equal((await request('/reports', reader.token)).status, 403);
    assert.equal((await request('/customers', reader.token)).status, 200);
    assert.equal((await request('/customers', reader.token, 'DELETE')).status, 403);
    assert.equal((await request('/users/' + admin.id, reader.token, 'PATCH', { name: 'takeover' })).status, 403);
    assert.equal((await request('/users/' + reader.id, reader.token, 'PATCH', { accessRoleId: null })).status, 403);
    assert.equal((await request('/users/' + admin.id, admin.token, 'PATCH', { role: 'ADMIN', accessRoleId: roleId })).status, 409);
    assert.equal((await request('/users/' + reader.id, admin.token, 'PATCH', { role: 'AGENT', accessRoleId: roleId })).status, 400);
    const department = await db.department.create({ data: { name: `RoleDept-${prefix}` } }); departments.push(department.id);
    assert.equal((await request('/roles/' + roleId, admin.token, 'PATCH', { ...input, scope: 'DEPARTMENT', permissions: ['users.view', 'users.update'] })).status, 200);
    assert.equal((await request('/users/' + reader.id, reader.token, 'PATCH', { departmentIds: [department.id] })).status, 403);
    const customer = await db.user.create({ data: { name: 'Role scope customer', role: 'CUSTOMER', passwordHash: hash } }); users.push(customer.id);
    const own = await db.conversation.create({ data: { subject: 'Own scope', searchSubject: 'own scope', departmentId: department.id, customerId: customer.id, assignedAgentId: reader.id } }); conversations.push(own.id);
    const other = await db.conversation.create({ data: { subject: 'Other scope', searchSubject: 'other scope', departmentId: department.id, customerId: customer.id, assignedAgentId: admin.id } }); conversations.push(other.id);
    assert.equal((await request('/roles/' + roleId, admin.token, 'PATCH', { ...input, scope: 'OWN', permissions: ['conversations.view', 'conversations.delete'] })).status, 200);
    const scopedList = await request('/conversations', reader.token);
    assert.equal(scopedList.status, 200);
    assert.deepEqual(scopedList.body.data.map((row: any) => row.id), [own.id]);
    assert.equal((await request('/conversations/' + other.id, reader.token)).status, 404);
    assert.equal((await request('/conversations/' + other.id, reader.token, 'DELETE')).status, 404);
    assert.equal((await request('/conversations/' + own.id + '/messages', reader.token, 'POST', { body: 'No reply permission' })).status, 403);
    assert.equal((await request('/conversations/' + own.id + '/messages', reader.token, 'POST', { body: 'No note permission', type: 'INTERNAL_NOTE' })).status, 403);
    assert.equal((await request('/conversations/' + own.id, reader.token, 'PATCH', { status: 'CLOSED' })).status, 403);
    assert.equal((await request('/conversations/' + own.id, reader.token, 'DELETE')).status, 200);
    assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: other.id } })).deletedAt, null);
  } finally {
    await db.notification.deleteMany({ where: { conversationId: { in: conversations } } });
    await db.conversationMessage.deleteMany({ where: { conversationId: { in: conversations } } });
    await db.conversation.deleteMany({ where: { id: { in: conversations } } });
    await db.department.deleteMany({ where: { id: { in: departments } } });
    await db.notification.deleteMany({ where: { userId: { in: users } } });
    await db.activityLog.deleteMany({ where: { OR: [{ userId: { in: users } }, { entityId: { in: [...roles, ...conversations] } }] } });
    await db.session.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.accessRole.deleteMany({ where: { id: { in: roles } } });
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.$disconnect();
  }
});
