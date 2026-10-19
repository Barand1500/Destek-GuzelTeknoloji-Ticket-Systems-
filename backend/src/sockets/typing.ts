import type { Server } from 'socket.io';
import { resolveActor } from '../middleware/auth.js';
import { db } from '../config/db.js';
import { can } from '../services/permissions.js';
import { visibility } from '../services/conversations.service.js';

export function attachConversationTyping(io: Server) {
  const writers = new Map<string, { conversationId: string; userId: string; name: string; expiresAt: number }>();
  const send = async (conversationId: string) => {
    await Promise.all([...io.sockets.sockets.values()].filter(socket => socket.data.typingConversation === conversationId).map(async socket => {
      try {
        const actor = await resolveActor(socket.handshake.auth.token);
        const visible = (actor.role === 'CUSTOMER' || can(actor, 'conversations.view')) && await db.conversation.count({ where: { AND: [visibility(actor), { id: conversationId }] } });
        const people = new Map<string, { userId: string; name: string; expiresAt: number }>();
        if (visible) for (const writer of writers.values()) {
          if (writer.conversationId === conversationId && writer.userId !== actor.id && writer.expiresAt > Date.now() && writer.expiresAt > (people.get(writer.userId)?.expiresAt ?? 0)) people.set(writer.userId, writer);
        }
        if (socket.data.typingConversation === conversationId) socket.emit('conversation:typing', { conversationId, people: [...people.values()].map(({ userId, name, expiresAt }) => ({ userId, name, expiresAt })) });
      } catch { socket.disconnect(true); }
    }));
  };
  const publish = (id: string) => { void send(id).catch(() => {}); };
  io.on('connection', socket => {
    let revision = 0, lastUpdate = 0;
    const clear = () => {
      const previous = writers.get(socket.id);
      writers.delete(socket.id);
      if (previous) publish(previous.conversationId);
    };
    socket.on('conversation:typing:watch', (id: unknown) => {
      revision++;
      clear();
      socket.data.typingConversation = typeof id === 'string' && id.length <= 100 ? id : undefined;
      if (socket.data.typingConversation) publish(socket.data.typingConversation);
    });
    socket.on('conversation:typing:update', async (input: unknown) => {
      if (!input || typeof input !== 'object') return;
      const { conversationId, active } = input as Record<string, unknown>;
      if (typeof conversationId !== 'string' || typeof active !== 'boolean' || socket.data.typingConversation !== conversationId) return;
      if (!active) { revision++; clear(); return; }
      if (Date.now() - lastUpdate < 800) return;
      lastUpdate = Date.now();
      const current = ++revision;
      try {
        const actor = await resolveActor(socket.handshake.auth.token);
        const allowed = actor.role === 'CUSTOMER' || (can(actor, 'conversations.view') && can(actor, 'conversations.reply'));
        const target = allowed && await db.conversation.count({ where: { AND: [visibility(actor), { id: conversationId, status: { not: 'CLOSED' } }] } });
        if (current !== revision || !socket.connected) return;
        if (!target) { clear(); return; }
        writers.set(socket.id, { conversationId, userId: actor.id, name: actor.name, expiresAt: Date.now() + 5000 });
        publish(conversationId);
      } catch { socket.disconnect(true); }
    });
    socket.on('disconnect', () => { revision++; clear(); });
  });
  const timer = setInterval(() => {
    const changed = new Set<string>();
    for (const [id, writer] of writers) if (writer.expiresAt <= Date.now()) { writers.delete(id); changed.add(writer.conversationId); }
    changed.forEach(publish);
  }, 1000);
  timer.unref();
  io.engine.on('close', () => { clearInterval(timer); writers.clear(); });
}
