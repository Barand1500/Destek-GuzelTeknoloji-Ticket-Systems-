import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
const { deliverSupportEmail, smtpFailureReason } = await import('../src/services/mailer.service.js');

test('Windows connection permission errors are not misreported as timeouts', () => {
  assert.match(smtpFailureReason({ code: 'ESOCKET', errno: -4092, syscall: 'connect', command: 'CONN' }), /EACCES/);
  assert.match(smtpFailureReason({ code: 'ESOCKET', message: 'connect EACCES 127.0.0.1:587', syscall: 'connect' }), /EACCES/);
  assert.match(smtpFailureReason({ code: 'ETIMEDOUT', command: 'CONN' }), /ETIMEDOUT/);
  assert.match(smtpFailureReason({ code: 'EAUTH', responseCode: 535 }), /EAUTH.*535/);
});

test('temporary SMTP failure is retried and then succeeds without sending real mail', async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await deliverSupportEmail('test@example.test', 'Test', 'Test', 'Test', undefined, async () => {
    if (++calls < 3) throw Object.assign(new Error('Connection lost'), { code: 'ECONNECTION' });
    return { sent: true, accepted: 1, rejected: 0, response: 'OK', messageId: '<retry-test@example.test>' };
  }, async ms => { delays.push(ms); });
  assert.equal(result.sent, true);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [5000, 10000]);
});

test('authentication rejection is not retried', async () => {
  let calls = 0;
  const result = await deliverSupportEmail('test@example.test', 'Test', 'Test', 'Test', undefined, async () => {
    calls++;
    throw Object.assign(new Error('Authentication rejected'), { code: 'EAUTH', responseCode: 535 });
  }, async () => { assert.fail('Permanent failure must not retry'); });
  assert.equal(result.sent, false);
  assert.equal(calls, 1);
});

test('temporary failures stop after three attempts', async () => {
  let calls = 0;
  const result = await deliverSupportEmail('test@example.test', 'Test', 'Test', 'Test', undefined, async () => {
    calls++;
    throw Object.assign(new Error('Timeout'), { code: 'ETIMEDOUT' });
  }, async () => {});
  assert.equal(result.sent, false);
  assert.equal(calls, 3);
});

test('ticket creation and staff replies reach the mail transport; internal notes do not', async t => {
  const { db } = await import('../src/config/db.js');
  const { env } = await import('../src/config/env.js');
  const nodemailer = (await import('nodemailer')).default;
  const { createConversation, addMessage } = await import('../src/services/conversations.service.js');
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  const audits: any[] = [];
  const customer = { id: 'customer', name: 'Test customer', email: 'customer@example.test' };
  const conversation = { id: 'conversation', number: 42, subject: 'Mail flow test', channel: 'TICKET', customerId: customer.id, customer, departmentId: 'department', assignedAgentId: null, firstResponseAt: new Date() };
  const actor = { id: 'admin', name: 'Test admin', email: 'admin@example.test', role: 'ADMIN' as const, departmentIds: [], sessionId: 'test' };
  const log = async ({ data }: any) => { audits.push(data); return data; };
  const tx = {
    priorityOption: { findFirst: async () => ({ code: 'NORMAL' }) },
    conversation: { create: async () => conversation, updateMany: async () => ({ count: 1 }), findUniqueOrThrow: async () => conversation },
    conversationMessage: { create: async ({ data }: any) => ({ id: 'message', createdAt: new Date(), ...data }) },
    activityLog: { create: log },
    user: { findMany: async () => [] },
    notification: { createMany: async () => ({ count: 1 }) },
  };
  // Prisma's proxy methods have no function-valued property descriptor, so
  // replace them directly and restore them after this isolated test.
  const restorers: Array<() => void> = [];
  function stub(target: any, key: string, value: any) {
    const original = target[key];
    target[key] = value;
    restorers.push(() => { target[key] = original; });
  }
  t.after(() => restorers.reverse().forEach(restore => restore()));
  stub(db, '$transaction', async (callback: any) => callback(tx));
  stub(db.department, 'findFirst', async () => ({ id: 'department' }));
  stub(db.user, 'findFirst', async () => customer);
  stub(db.conversation, 'findUnique', async () => conversation);
  stub(db.activityLog, 'create', log);
  stub(db.integrationSettings, 'findUnique', async () => ({ smtpEnabled: true, smtpHost: 'smtp.example.test', smtpPort: 587, smtpSecure: true, smtpFromAddress: 'support@example.test', smtpFromName: 'Support', smtpUser: 'test', smtpPassword: 'fake' }));
  t.mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (mail: any) => { sent.push(mail); return { accepted: [mail.to], rejected: [], response: '250 OK', messageId: '<test@example.test>' }; } }));
  const previous = env.NODE_ENV;
  env.NODE_ENV = 'development'; // Exercise the real queue, with all network and DB calls mocked.
  const flush = () => new Promise<void>(resolve => setImmediate(resolve));
  try {
    await createConversation(actor, { customerId: customer.id, departmentId: 'department', subject: conversation.subject, message: 'Initial request', priority: 'NORMAL', channel: 'TICKET' });
    await flush();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, customer.email);
    assert.match(sent[0].subject, /#42/);
    await addMessage(actor, conversation.id, { body: 'Public answer', type: 'AGENT_REPLY' });
    await flush();
    assert.equal(sent.length, 2);
    assert.match(sent[1].text, /Public answer/);
    assert.equal(sent[1].to, customer.email);
    await addMessage(actor, conversation.id, { body: 'Private note', type: 'INTERNAL_NOTE' });
    await flush();
    assert.equal(sent.length, 2);
    assert.equal(audits.filter(item => item.action === 'conversation.email_sent').length, 2);
  } finally {
    await flush();
    env.NODE_ENV = previous;
    t.mock.restoreAll();
  }
});
