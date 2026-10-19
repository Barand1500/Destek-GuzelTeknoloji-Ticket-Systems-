import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { db } from '../src/config/db.js';
import { prepareInboundEmailAttachments } from '../src/services/inbound-email-attachments.js';
import { parsedEmailReplyText, persistInboundEmail } from '../src/services/inbound-email.service.js';
import { withStoredUploads, discardStoredUploads, uploadRoot, type StoredUpload } from '../src/services/uploads.service.js';
import { deliverSupportEmail, emailAttachments, type EmailAttachment } from '../src/services/mailer.service.js';

test('outbound MIME keeps attachment filenames and bytes through a retry', async () => {
  const content = Buffer.from('Dosya içeriği: deneme');
  const file = { originalname: 'çalışma.txt', mimetype: 'text/plain', size: content.length, buffer: content } as Express.Multer.File;
  let stored: StoredUpload[] = [];
  try {
    await withStoredUploads([file], async files => {
      stored = files;
      let calls = 0;
      const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
      const send = async (to: string, subject: string, text: string, _audit: unknown, attachments: EmailAttachment[] = []) => {
        calls++;
        if (calls === 1) throw Object.assign(new Error('Temporary timeout'), { code: 'ETIMEDOUT' });
        const result = await transport.sendMail({ from: 'support@example.test', to, subject, text, attachments });
        const parsed = await simpleParser(result.message as Buffer);
        assert.equal(parsed.attachments[0].filename, 'çalışma.txt');
        assert.deepEqual(parsed.attachments[0].content, content);
        return { sent: true, accepted: 1, rejected: 0, response: '250 OK', messageId: result.messageId };
      };
      assert.deepEqual(await deliverSupportEmail('customer@example.test', 'Test', 'Reply', 'Test', undefined, send, async () => {}, emailAttachments(files)), { sent: true });
      assert.equal(calls, 2);
    });
  } finally { await discardStoredUploads(stored); }
});

test('inbound MIME attachments are saved with the message, attachment-only replies work and repeated scans do not duplicate files', async () => {
  let customerId = '', departmentId = '', conversationId = '';
  const files: StoredUpload[] = [];
  const suffix = randomUUID();
  const content = Buffer.from('Customer file contents');
  try {
    const email = `attachments-${suffix}@example.test`;
    const customer = await db.user.create({ data: { name: `Attachment test ${suffix}`, email, role: 'CUSTOMER', passwordHash: 'test-only' } }); customerId = customer.id;
    const department = await db.department.create({ data: { name: `Attachment test ${suffix}` } }); departmentId = department.id;
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const mime = await transport.sendMail({ from: email, to: 'support@example.test', subject: 'Files', text: 'My reply', attachments: [
      { filename: 'çalışma.txt', content, contentType: 'text/plain' },
      { filename: 'unsafe.exe', content: Buffer.from('MZ'), contentType: 'application/octet-stream' },
    ] });
    const parsed = await simpleParser(mime.message as Buffer);
    const prepared = await prepareInboundEmailAttachments(parsed.attachments);
    assert.equal(prepared.files.length, 1);
    assert.deepEqual(prepared.skipped, ['unsafe.exe']);
    const input = { mailbox: `test-${suffix}`, uid: 1, messageId: `<${suffix}@example.test>`, from: { address: email }, subject: 'Files', body: await parsedEmailReplyText(parsed), departmentId, skippedAttachments: prepared.skipped };
    const first = await withStoredUploads(prepared.files, attachments => { files.push(...attachments); return persistInboundEmail({ ...input, attachments }); });
    assert.ok(first); conversationId = first;
    const message = await db.conversationMessage.findFirstOrThrow({ where: { conversationId }, include: { attachments: true } });
    assert.match(message.body, /My reply/);
    assert.match(message.body, /unsafe\.exe/);
    assert.equal(message.attachments.length, 1);
    assert.equal(message.attachments[0].originalName, 'çalışma.txt');
    assert.deepEqual(await readFile(path.join(uploadRoot, message.attachments[0].storageKey)), content);
    const duplicateFiles: StoredUpload[] = [];
    assert.equal(await withStoredUploads(prepared.files, attachments => { duplicateFiles.push(...attachments); files.push(...attachments); return persistInboundEmail({ ...input, attachments }); }), conversationId);
    await assert.rejects(readFile(path.join(uploadRoot, duplicateFiles[0].storageKey)), { code: 'ENOENT' });
    assert.equal(await db.conversationMessage.count({ where: { conversationId } }), 1);
    const ticket = await db.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    await withStoredUploads(prepared.files, attachments => { files.push(...attachments); return persistInboundEmail({ ...input, uid: 2, messageId: `<reply-${suffix}@example.test>`, subject: `Re: #TK-${ticket.number}`, body: '', attachments, skippedAttachments: [] }); });
    assert.equal(await db.conversationMessage.count({ where: { conversationId, body: 'Ek dosya gönderildi.' } }), 1);
    const messageIds = (await db.conversationMessage.findMany({ where: { conversationId }, select: { id: true } })).map(row => row.id);
    assert.equal(await db.conversationAttachment.count({ where: { messageId: { in: messageIds } } }), 2);
  } finally {
    if (conversationId) {
      const ids = (await db.conversationMessage.findMany({ where: { conversationId }, select: { id: true } })).map(row => row.id);
      await db.notification.deleteMany({ where: { conversationId } });
      await db.activityLog.deleteMany({ where: { entityId: conversationId } });
      await db.incomingEmail.deleteMany({ where: { conversationId } });
      await db.conversationAttachment.deleteMany({ where: { messageId: { in: ids } } });
      await db.conversationMessage.deleteMany({ where: { conversationId } });
      await db.conversation.delete({ where: { id: conversationId } });
    }
    if (customerId) await db.user.delete({ where: { id: customerId } });
    if (departmentId) await db.department.delete({ where: { id: departmentId } });
    await discardStoredUploads(files);
    await db.$disconnect();
  }
});
