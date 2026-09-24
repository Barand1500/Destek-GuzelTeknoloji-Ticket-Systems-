import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSender, selectEmailCustomer } from '../src/services/inbound-email-matching.js';
import { inboundReplyText } from '../src/services/inbound-email.service.js';

const adem = { id: 'adem', name: 'ADEM DURGUN', email: 'yunusdurgun22@gmail.com', extraEmails: 'alias@example.test, other@example.test' };
const yunus = { id: 'yunus', name: 'YUNUS DURGUN', email: 'durgunyunus4@gmail.com', extraEmails: null };

test('exact sender address wins even when display name matches another customer', () => {
  assert.equal(selectEmailCustomer([adem, yunus], 'YUNUSDURGUN22@gmail.com', 'Yunus Durgun'), adem);
  assert.equal(selectEmailCustomer([yunus], 'unknown@example.test', 'Yunus Durgun'), undefined);
});
test('additional addresses use full tokens rather than substring matching', () => {
  assert.equal(matchesSender(adem, 'alias@example.test'), true);
  assert.equal(matchesSender(adem, 'lias@example.test'), false);
});

test('inbound email saves only the new reply, not Gmail quoted history', () => {
  assert.equal(inboundReplyText('merhabalar çözüldü mü\n\n24 Eyl 2026 Per 09:29 tarihinde Ercan Güzel şunu yazdı:\n> önceki yanıt\n> devamı'), 'merhabalar çözüldü mü');
  assert.equal(inboundReplyText('Yeni cevabım\n\nOn Tue, Sep 24, 2026 at 09:29 Ercan wrote:\n> Previous reply'), 'Yeni cevabım');
  assert.equal(inboundReplyText('<p>Yeni cevabım</p><br><div>24 Eyl 2026 tarihinde Ercan şunu yazdı:</div><blockquote>Önceki yanıt</blockquote>'), 'Yeni cevabım');
  assert.equal(inboundReplyText('hayır\n\nErcan Güzel, 24 Eyl 2026 Per, 09:41 tarihinde\nönceki e-posta'), 'hayır');
});
test('shared addresses cannot be assigned arbitrarily', () => {
  assert.throws(() => selectEmailCustomer([adem, { ...adem, id: 'another', name: 'Someone else' }], adem.email), /belirsiz/);
});

test('inbound threading validates the sender and preserves unthreaded mail as a new request', async t => {
  const { db } = await import('../src/config/db.js');
  const { persistInboundEmail } = await import('../src/services/inbound-email.service.js');
  const { env } = await import('../src/config/env.js');
  const { ticketReplyAddress } = await import('../src/services/email-reply-address.js');
  const restored: Array<() => void> = [];
  function stub(target: any, key: string, replacement: any) {
    const original = target[key]; target[key] = replacement;
    restored.push(() => { target[key] = original; });
  }
  t.after(() => restored.reverse().forEach(restore => restore()));
  const target = { id: 'ticket-650', customerId: adem.id, departmentId: 'technical', assignedAgentId: null };
  let duplicate = false;
  let foreignReference = false;
  let activeTickets: any[] = [];
  stub(db.conversation, 'findMany', async ({ where }: any) => {
    assert.equal(where.messages.some.type, 'AGENT_REPLY');
    return activeTickets.filter(ticket => ticket.messages.length);
  });
  const messages: any[] = [];
  const newTickets: any[] = [];
  stub(db.incomingEmail, 'findFirst', async ({ where }: any) => where.OR && duplicate ? { conversationId: target.id } : null);
  stub(db.user, 'findMany', async () => [adem, yunus]);
  stub(db.department, 'findFirst', async () => ({ id: 'technical' }));
  stub(db.activityLog, 'findFirst', async () => ({ entityId: foreignReference ? 'other-customer-ticket' : target.id }));
  stub(db.conversation, 'findFirst', async ({ where }: any) => {
    assert.deepEqual(where.customerId.in, [adem.id]);
    assert.equal(where.deletedAt, null);
    return where.id === target.id || where.number === 650 ? target : null;
  });
  const tx = {
    conversation: { create: async ({ data }: any) => { newTickets.push(data); return { ...data, id: 'new-ticket' }; }, update: async () => target },
    conversationMessage: { create: async ({ data }: any) => { messages.push(data); return data; } },
    incomingEmail: { create: async () => ({}) },
    activityLog: { create: async () => ({}) },
    user: { findMany: async () => [] },
  };
  stub(db, '$transaction', async (callback: any) => callback(tx));
  const base = { mailbox: 'INBOX', uid: 193, from: { address: adem.email, name: 'Yunus Durgun' }, subject: 'Changed subject', body: 'Thank you' };
  assert.equal(await persistInboundEmail({ ...base, inReplyTo: '<sent@example.test>' }), target.id);
  assert.equal(messages.at(-1).authorId, adem.id);
  assert.equal(newTickets.length, 0);
  assert.equal(await persistInboundEmail({ ...base, recipients: [ticketReplyAddress('support@gmail.com', 650, env.JWT_ACCESS_SECRET)!] }), target.id);
  assert.equal(await persistInboundEmail({ ...base, subject: 'Re: (#650)', from: { address: 'alias@example.test' } }), target.id);
  assert.equal(await persistInboundEmail(base), 'new-ticket');
  assert.equal(newTickets.at(-1).customerId, adem.id);
  activeTickets = [{ ...target, messages: [{ id: 'staff-reply' }] }];
  assert.equal(await persistInboundEmail(base), target.id);
  activeTickets = [{ ...target, messages: [] }];
  assert.equal(await persistInboundEmail(base), 'new-ticket');
  activeTickets = [{ ...target, messages: [{ id: 'staff-reply' }] }, { ...target, id: 'another-active-ticket', messages: [] }];
  assert.equal(await persistInboundEmail(base), target.id);
  activeTickets[1].messages = [{ id: 'another-staff-reply' }];
  assert.equal(await persistInboundEmail(base), 'new-ticket');
  activeTickets = [{ ...target, messages: [{ id: 'staff-reply' }] }];
  foreignReference = true;
  assert.equal(await persistInboundEmail({ ...base, references: ['<foreign@example.test>'] }), 'new-ticket');
  duplicate = true;
  const before = messages.length;
  assert.equal(await persistInboundEmail(base), target.id);
  assert.equal(messages.length, before);
});
