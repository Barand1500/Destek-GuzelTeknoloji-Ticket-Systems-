import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { io as connect, type Socket } from 'socket.io-client';
import { db } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { attachSockets } from '../src/sockets/index.js';

type Update = { conversationId: string; people: Array<{ userId: string; name: string; expiresAt: number }> };
test('typing is live, private to authorized viewers, expires and clears on stop/disconnect', async () => {
  const server = createServer(), io = attachSockets(server);
  const users: string[] = [], sockets: Socket[] = [];
  let departmentId = '', conversationId = '';
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function account(role: 'ADMIN' | 'CUSTOMER') {
    const user = await db.user.create({ data: { name: `Typing ${role}`, passwordHash: 'unused', role } }); users.push(user.id);
    const session = await db.session.create({ data: { userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000) } });
    return { id: user.id, token: jwt.sign({ sid: session.id }, env.JWT_ACCESS_SECRET, { subject: user.id, expiresIn: '1m', algorithm: 'HS256', issuer: 'helpdesk', audience: 'helpdesk-web' }) };
  }
  async function client(token: string) {
    const socket = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false }); sockets.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return socket;
  }
  function next(socket: Socket, predicate: (value: Update) => boolean, timeout = 4000) {
    return new Promise<Update>((resolve, reject) => {
      const timer = setTimeout(() => { socket.off('conversation:typing', listener); reject(new Error('Typing event missing')); }, timeout);
      function listener(value: Update) { if (value.conversationId === conversationId && predicate(value)) { clearTimeout(timer); socket.off('conversation:typing', listener); resolve(value); } }
      socket.on('conversation:typing', listener);
    });
  }
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  try {
    departmentId = (await db.department.create({ data: { name: `Typing test ${randomUUID()}` } })).id;
    const admin = await account('ADMIN'), customer = await account('CUSTOMER'), stranger = await account('CUSTOMER');
    conversationId = (await db.conversation.create({ data: { subject: 'Typing test', searchSubject: 'typing test', customerId: customer.id, departmentId } })).id;
    const writer = await client(admin.token), reader = await client(customer.token), foreign = await client(stranger.token), sameUser = await client(admin.token);
    const foreignEvents: Update[] = [], selfEvents: Update[] = [];
    foreign.on('conversation:typing', value => foreignEvents.push(value));
    sameUser.on('conversation:typing', value => selfEvents.push(value));
    for (const socket of [writer, reader, foreign, sameUser]) {
      const ready = next(socket, value => value.people.length === 0);
      socket.emit('conversation:typing:watch', conversationId); await ready;
    }
    let incoming = next(reader, value => value.people.some(person => person.userId === admin.id));
    writer.emit('conversation:typing:update', { conversationId, active: true, name: 'Spoofed name', body: 'Never broadcast this text' });
    const update = await incoming;
    assert.equal(update.people[0].name, 'Typing ADMIN');
    assert(!JSON.stringify(update).includes('Never broadcast'));
    await pause(200);
    assert(foreignEvents.every(value => value.people.length === 0));
    assert(selfEvents.every(value => value.people.length === 0));
    let cleared = next(reader, value => value.people.length === 0);
    writer.emit('conversation:typing:update', { conversationId, active: false }); await cleared;
    await pause(850);
    incoming = next(reader, value => value.people.length === 1);
    writer.emit('conversation:typing:update', { conversationId, active: true }); await incoming;
    cleared = next(reader, value => value.people.length === 0, 7000);
    await cleared; // No heartbeat: expired even if a stop packet is lost.
    incoming = next(reader, value => value.people.length === 1);
    writer.emit('conversation:typing:update', { conversationId, active: true }); await incoming;
    cleared = next(reader, value => value.people.length === 0);
    writer.disconnect(); await cleared;
    const illegitimate: Update[] = [];
    reader.on('conversation:typing', value => illegitimate.push(value));
    foreign.emit('conversation:typing:update', { conversationId, active: true });
    await pause(250);
    assert(illegitimate.every(value => value.people.length === 0));
  } finally {
    sockets.forEach(socket => socket.disconnect());
    await new Promise<void>(resolve => io.close(() => resolve()));
    if (conversationId) await db.conversation.delete({ where: { id: conversationId } });
    await db.session.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    if (departmentId) await db.department.delete({ where: { id: departmentId } });
    await db.$disconnect();
  }
});
