import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { io as connect, type Socket } from 'socket.io-client';
import { env } from '../src/config/env.js';
import { db } from '../src/config/db.js';
import { attachSockets } from '../src/sockets/index.js';
import { presenceEvents, staffPresence, type PresenceChanged } from '../src/services/presence.service.js';
import { resolveActor } from '../src/middleware/auth.js';

test('presence broadcasts reach supervisors in their department and respect custom role changes', async () => {
  const server = createServer();
  const io = attachSockets(server);
  const users: string[] = [], departments: string[] = [], roles: string[] = [];
  const sockets: Socket[] = [];
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function account(role: 'ADMIN' | 'SUPERVISOR' | 'AGENT', departmentId?: string, accessRoleId?: string) {
    const user = await db.user.create({ data: { name: 'Presence routing test', passwordHash: 'unused', role, accessRoleId, ...(departmentId ? { departments: { create: { departmentId } } } : {}) } });
    users.push(user.id);
    const session = await db.session.create({ data: { userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000) } });
    const token = jwt.sign({ sid: session.id }, env.JWT_ACCESS_SECRET, { subject: user.id, expiresIn: '1m', algorithm: 'HS256', issuer: 'helpdesk', audience: 'helpdesk-web' });
    return { id: user.id, token };
  }
  async function viewer(token: string) {
    const socket = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return socket;
  }
  function next(socket: Socket, path: string) {
    return new Promise<PresenceChanged>((resolve, reject) => {
      const timer = setTimeout(() => { socket.off('presence:changed', listener); reject(new Error('Presence notification did not arrive')); }, 4000);
      function listener(change: PresenceChanged) { if (change.path === path) { clearTimeout(timer); socket.off('presence:changed', listener); resolve(change); } }
      socket.on('presence:changed', listener);
    });
  }
  function change(id: string, path: string) {
    presenceEvents.emit('changed', { id, state: 'ONLINE', path, page: 'Gelen kutusu', lastActivityAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() } satisfies PresenceChanged);
  }
  try {
    for (let index = 0; index < 2; index++) departments.push((await db.department.create({ data: { name: `Presence routing ${randomUUID()}` } })).id);
    const customRole = await db.accessRole.create({ data: { name: `Presence reader ${randomUUID()}`, permissions: ['presence.view'], scope: 'DEPARTMENT' } });
    roles.push(customRole.id);
    const admin = await account('ADMIN');
    const supervisor = await account('SUPERVISOR', departments[0]);
    const custom = await account('ADMIN', departments[0], customRole.id);
    const ownStaff = await account('AGENT', departments[0]);
    const otherStaff = await account('AGENT', departments[1]);
    const [adminSocket, supervisorSocket, customSocket] = await Promise.all([viewer(admin.token), viewer(supervisor.token), viewer(custom.token)]);
    const receivedBySupervisor: string[] = [], receivedByCustom: string[] = [];
    supervisorSocket.on('presence:changed', (event: PresenceChanged) => receivedBySupervisor.push(event.path));
    customSocket.on('presence:changed', (event: PresenceChanged) => receivedByCustom.push(event.path));
    const firstPath = `/test/${randomUUID()}`;
    const first = [next(adminSocket, firstPath), next(supervisorSocket, firstPath), next(customSocket, firstPath)];
    change(ownStaff.id, firstPath);
    assert((await Promise.all(first)).every(event => event.id === ownStaff.id));

    const scopedList = await staffPresence(await resolveActor(custom.token));
    assert(scopedList.staff.some(person => person.id === ownStaff.id));
    assert(!scopedList.staff.some(person => person.id === otherStaff.id));

    const foreignPath = `/test/${randomUUID()}`;
    const foreign = next(adminSocket, foreignPath);
    change(otherStaff.id, foreignPath);
    await foreign;
    await db.accessRole.update({ where: { id: customRole.id }, data: { permissions: [] } });
    const revokedPath = `/test/${randomUUID()}`;
    const revoked = [next(adminSocket, revokedPath), next(supervisorSocket, revokedPath)];
    change(ownStaff.id, revokedPath);
    await Promise.all(revoked);
    await new Promise(resolve => setTimeout(resolve, 250));
    assert(!receivedBySupervisor.includes(foreignPath));
    assert(!receivedByCustom.includes(foreignPath));
    assert(!receivedByCustom.includes(revokedPath));
  } finally {
    for (const socket of sockets) socket.disconnect();
    await new Promise<void>(resolve => io.close(() => resolve()));
    await db.session.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.department.deleteMany({ where: { id: { in: departments } } });
    await db.accessRole.deleteMany({ where: { id: { in: roles } } });
    await db.$disconnect();
  }
});
