import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { db } from '../src/config/db.js';
import { createConversation, addMessage } from '../src/services/conversations.service.js';
import { enqueueOutbound, enqueueChannelReply } from '../src/services/outbound-queue.store.js';
import { processOutboundQueue } from '../src/services/outbound-queue.service.js';
import { receiveMetaWebhook } from '../src/services/integrations.service.js';
import { withStoredUploads, discardStoredUploads, type StoredUpload } from '../src/services/uploads.service.js';

test('persistent outbox commits with messages, resumes retries and expired work, and protects independent channels and delivery receipts', async t => {
  const suffix = randomUUID(), people: string[] = [], conversations: string[] = [];
  let departmentId = '', stored: StoredUpload[] = [], smtpFailure: string | undefined, earlyReceipt = false;
  const sentMail: any[] = [], sentMeta: any[] = [], sentSms: any[] = [];
  const originalSettings = db.integrationSettings.findUnique;
  const secret = 'outbox-test-secret';
  t.mock.method(console, 'error', () => {});
  db.integrationSettings.findUnique = (async () => ({ smtpEnabled: true, smtpHost: 'smtp.example.test', smtpFromAddress: 'support@example.test', smtpPort: 587,
    whatsappEnabled: true, whatsappPhoneNumberId: 'number', whatsappAccessToken: 'test-token', whatsappAppSecret: secret,
    smsEnabled: true, smsApiUser: 'test', smsApiPassword: 'test', smsSender: 'Test' })) as typeof originalSettings;
  const originalTransaction = db.$transaction;
  const transact = originalTransaction.bind(db);
  db.$transaction = (async (work: any, options: any) => transact(async (tx: any) => {
    tx.integrationSettings.findUnique = db.integrationSettings.findUnique;
    return work(tx);
  }, options)) as typeof originalTransaction;
  t.mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (mail: any) => {
    sentMail.push(mail);
    if (smtpFailure) throw Object.assign(new Error('SMTP failure'), { code: smtpFailure });
    return { accepted: [mail.to], rejected: [], messageId: mail.messageId, response: '250 OK' };
  } }));
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    if (String(url).endsWith('/media')) {
      assert.ok(init?.body instanceof FormData);
      assert.equal(await (init.body.get('file') as File).text(), 'Outbox attachment');
      return Response.json({ id: `media-${sentMeta.length}` });
    }
    const body = JSON.parse(String(init?.body));
    if (String(url).includes('netgsm')) { sentSms.push(body); return Response.json({ code: '00', jobid: `sms-${sentSms.length}` }); }
    sentMeta.push(body);
    const id = `wamid.outbox-${suffix}-${sentMeta.length}`;
    if (earlyReceipt) {
      const payload = { entry: [{ changes: [{ value: { statuses: [{ id, status: 'delivered', recipient_id: '905551234567', biz_opaque_callback_data: body.biz_opaque_callback_data }] } }] }] };
      const raw = Buffer.from(JSON.stringify(payload));
      await receiveMetaWebhook(payload, `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`, raw);
      throw Object.assign(new Error('Response lost after delivery'), { code: 'ETIMEDOUT' });
    }
    return Response.json({ messages: [{ id }] });
  });
  try {
    const admin = await db.user.create({ data: { name: `Outbox admin ${suffix}`, role: 'ADMIN', passwordHash: 'test-only' } }); people.push(admin.id);
    const customer = await db.user.create({ data: { name: `Outbox customer ${suffix}`, email: `outbox-${suffix}@example.test`, phone: '905551234567', role: 'CUSTOMER', passwordHash: 'test-only' } }); people.push(customer.id);
    const department = await db.department.create({ data: { name: `Outbox ${suffix}` } }); departmentId = department.id;
    const actor = { id: admin.id, name: admin.name, email: '', role: 'ADMIN' as const, departmentIds: [], sessionId: 'test' };
    const content = Buffer.from('Outbox attachment');
    await withStoredUploads([{ originalname: 'test.txt', mimetype: 'text/plain', size: content.length, buffer: content } as Express.Multer.File], async files => {
      stored = files;
      const conversation = await createConversation(actor, { customerId: customer.id, departmentId, channel: 'EMAIL', replyChannels: ['EMAIL', 'WHATSAPP', 'SMS'], subject: `Outbox ${suffix}`, message: 'First message', priority: 'NORMAL' }, files);
      conversations.push(conversation.id);
      assert.equal(await db.outboundMessage.count({ where: { conversationId: conversation.id, status: 'PENDING' } }), 3);
      assert.equal(sentMail.length, 0, 'API saves durable jobs without sending before commit');
      await processOutboundQueue(admin.id);
      assert.equal(await db.outboundMessage.count({ where: { conversationId: conversation.id, status: 'SENT' } }), 3);
      assert.equal(sentMail[0].attachments[0].filename, 'test.txt');
      assert.equal(sentMeta[0].document.caption, 'First message');
      assert.equal(sentSms.length, 1);

      const count = await db.outboundMessage.count({ where: { userId: admin.id } });
      await addMessage(actor, conversation.id, { body: 'Internal', type: 'INTERNAL_NOTE' });
      assert.equal(await db.outboundMessage.count({ where: { userId: admin.id } }), count);
      smtpFailure = 'ETIMEDOUT';
      await addMessage(actor, conversation.id, { body: 'Public retry', type: 'AGENT_REPLY' });
      await processOutboundQueue(admin.id);
      const retry = await db.outboundMessage.findFirstOrThrow({ where: { userId: admin.id, status: 'PENDING' } });
      assert.equal(retry.channel, 'EMAIL');
      assert.equal(retry.attempts, 1);
      assert.equal(await db.outboundMessage.count({ where: { conversationId: conversation.id, status: 'SENT' } }), 5);
      smtpFailure = undefined;
      await db.outboundMessage.update({ where: { id: retry.id }, data: { availableAt: new Date(0) } });
      await processOutboundQueue(admin.id);
      assert.equal((await db.outboundMessage.findUniqueOrThrow({ where: { id: retry.id } })).attempts, 2);
      assert.equal(sentMail.at(-1).messageId, sentMail.at(-2).messageId, 'SMTP retries keep the same Message-ID');
      const context = { conversationId: conversation.id, userId: admin.id };
      const crashed = await enqueueOutbound('EMAIL', { recipient: { email: customer.email }, subject: 'Resume', text: 'Resume', context });
      await db.outboundMessage.update({ where: { id: crashed.id }, data: { status: 'PROCESSING', attempts: 1, leaseToken: 'dead-process', leaseUntil: new Date(0) } });
      await processOutboundQueue(admin.id);
      assert.equal((await db.outboundMessage.findUniqueOrThrow({ where: { id: crashed.id } })).status, 'SENT');
      const beforeRollback = await db.outboundMessage.count({ where: { userId: admin.id } });
      await assert.rejects(db.$transaction(async tx => {
        await tx.conversationMessage.create({ data: { conversationId: conversation.id, authorId: admin.id, type: 'AGENT_REPLY', body: 'Rolled back' } });
        await enqueueOutbound('EMAIL', { recipient: { email: customer.email }, text: 'Rolled back', context }, tx);
        throw new Error('Rollback');
      }), /Rollback/);
      assert.equal(await db.conversationMessage.count({ where: { conversationId: conversation.id, body: 'Rolled back' } }), 0);
      assert.equal(await db.outboundMessage.count({ where: { userId: admin.id } }), beforeRollback);
      const rejected = await enqueueOutbound('EMAIL', { recipient: { email: customer.email }, subject: 'Reject', text: 'Reject', context });
      smtpFailure = 'EAUTH'; await processOutboundQueue(admin.id); smtpFailure = undefined;
      assert.equal((await db.outboundMessage.findUniqueOrThrow({ where: { id: rejected.id } })).status, 'FAILED');
      earlyReceipt = true;
      await enqueueChannelReply('WHATSAPP', { phone: customer.phone }, 'Early receipt', { ...context, messageId: randomUUID() }, files);
      await processOutboundQueue(admin.id);
      const receipts = sentMeta.length;
      await processOutboundQueue(admin.id);
      assert.equal(sentMeta.length, receipts, 'an early signed delivery prevents resending after a lost HTTP response');
      assert.equal(await db.outboundMessage.count({ where: { userId: admin.id, status: { in: ['PENDING', 'PROCESSING'] } } }), 0);
      earlyReceipt = false;
      // Form is a portal destination, not an implicit email delivery channel.
      await db.conversation.update({ where: { id: conversation.id }, data: { replyChannels: ['WHATSAPP', 'FORM'] } });
      const formReply = await addMessage(actor, conversation.id, { body: 'WhatsApp and portal only', type: 'AGENT_REPLY' });
      assert.equal(formReply.visibleInForm, true);
      const replyJobs = await db.outboundMessage.findMany({ where: { dedupeKey: { startsWith: `${formReply.id}:` } } });
      assert.deepEqual(replyJobs.map(job => job.channel), ['WHATSAPP']);
      const metaCount = sentMeta.length, mailCount = sentMail.length;
      await processOutboundQueue(admin.id);
      assert.equal(sentMeta.length, metaCount + 1);
      assert.equal(sentMail.length, mailCount);
      assert.equal((await db.outboundMessage.findUniqueOrThrow({ where: { id: replyJobs[0].id } })).status, 'SENT');
      await db.conversation.update({ where: { id: conversation.id }, data: { replyChannels: ['FORM'] } });
      const portalOnly = await addMessage(actor, conversation.id, { body: 'Portal only', type: 'AGENT_REPLY' });
      assert.equal(portalOnly.visibleInForm, true);
      assert.equal(await db.outboundMessage.count({ where: { dedupeKey: { startsWith: `${portalOnly.id}:` } } }), 0);
      await db.conversation.update({ where: { id: conversation.id }, data: { replyChannels: ['EMAIL', 'WHATSAPP', 'SMS'] } });
    });
  } finally {
    db.$transaction = originalTransaction;
    db.integrationSettings.findUnique = originalSettings;
    await db.outboundMessage.deleteMany({ where: { userId: { in: people } } });
    await db.activityLog.deleteMany({ where: { userId: { in: people } } });
    await db.notification.deleteMany({ where: { conversationId: { in: conversations } } });
    await db.externalMessage.deleteMany({ where: { conversationId: { in: conversations } } });
    const ids = (await db.conversationMessage.findMany({ where: { conversationId: { in: conversations } }, select: { id: true } })).map(row => row.id);
    await db.conversationAttachment.deleteMany({ where: { messageId: { in: ids } } });
    await db.conversationMessage.deleteMany({ where: { conversationId: { in: conversations } } });
    await db.conversation.deleteMany({ where: { id: { in: conversations } } });
    await db.user.deleteMany({ where: { id: { in: people } } });
    if (departmentId) await db.department.delete({ where: { id: departmentId } });
    await discardStoredUploads(stored);
    await db.$disconnect();
  }
});

test('a delayed conversation cannot starve other conversations behind fifty blocked jobs', async t => {
  const people: string[] = [], conversations: string[] = [];
  let departmentId = '';
  const suffix = randomUUID(), delivered: string[] = [];
  const originalSettings = db.integrationSettings.findUnique;
  db.integrationSettings.findUnique = (async () => ({ smtpEnabled: true, smtpHost: 'smtp.example.test', smtpFromAddress: 'support@example.test', smtpPort: 587 })) as typeof originalSettings;
  t.mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (mail: any) => { delivered.push(mail.text); return { accepted: [mail.to], rejected: [], messageId: mail.messageId, response: '250 OK' }; } }));
  try {
    const actor = await db.user.create({ data: { name: `Outbox order ${suffix}`, role: 'ADMIN', passwordHash: 'test-only' } }); people.push(actor.id);
    const customer = await db.user.create({ data: { name: `Outbox order customer ${suffix}`, role: 'CUSTOMER', passwordHash: 'test-only' } }); people.push(customer.id);
    const department = await db.department.create({ data: { name: `Outbox order ${suffix}` } }); departmentId = department.id;
    for (let i = 0; i < 2; i++) {
      const row = await db.conversation.create({ data: { customerId: customer.id, departmentId, subject: `Order ${i}`, searchSubject: 'order' } }); conversations.push(row.id);
    }
    const payload = { recipient: { email: 'test@example.test' }, text: 'Blocked', context: { conversationId: conversations[0], userId: actor.id } };
    const held = await enqueueOutbound('EMAIL', payload);
    await db.outboundMessage.update({ where: { id: held.id }, data: { createdAt: new Date(0), availableAt: new Date('2100-01-01') } });
    for (let i = 0; i < 60; i++) await enqueueOutbound('EMAIL', { ...payload, text: `Later ${i}` });
    const independent = { ...payload, text: 'Independent', context: { conversationId: conversations[1], userId: actor.id } };
    const dedupeKey = `dedupe-${suffix}`;
    const one = await enqueueOutbound('EMAIL', independent, db, dedupeKey);
    const two = await enqueueOutbound('EMAIL', independent, db, dedupeKey);
    assert.equal(one.id, two.id);
    await processOutboundQueue(actor.id);
    assert.deepEqual(delivered, ['Independent']);
    assert.equal(await db.outboundMessage.count({ where: { userId: actor.id, status: 'PENDING' } }), 61);
    await db.conversation.update({ where: { id: conversations[1] }, data: { deletedAt: new Date() } });
    const cancelled = await enqueueOutbound('EMAIL', independent);
    await processOutboundQueue(actor.id);
    assert.equal((await db.outboundMessage.findUniqueOrThrow({ where: { id: cancelled.id } })).status, 'CANCELLED');
    assert.deepEqual(delivered, ['Independent']);
  } finally {
    db.integrationSettings.findUnique = originalSettings;
    await db.outboundMessage.deleteMany({ where: { userId: { in: people } } });
    await db.activityLog.deleteMany({ where: { userId: { in: people } } });
    await db.conversation.deleteMany({ where: { id: { in: conversations } } });
    await db.user.deleteMany({ where: { id: { in: people } } });
    if (departmentId) await db.department.delete({ where: { id: departmentId } });
    await db.$disconnect();
  }
});
