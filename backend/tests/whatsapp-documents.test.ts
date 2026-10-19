import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { db } from '../src/config/db.js';
import { sendConversationChannelReply, receiveMetaWebhook } from '../src/services/integrations.service.js';
import { downloadWhatsappDocument, whatsappFileKind } from '../src/services/whatsapp-media.service.js';
import { withStoredUploads, discardStoredUploads, type StoredUpload } from '../src/services/uploads.service.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC1lEQVR42mP8/x8AAwMCAO+j5xkAAAAASUVORK5CYII=', 'base64');

test('WhatsApp document downloads preserve names and reject unsupported or oversized documents', async t => {
  const pdf = Buffer.from('%PDF-1.4\n%%EOF');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer token');
    return ++calls % 2 ? Response.json({ url: 'https://lookaside.fbsbx.com/doc', mime_type: 'application/pdf', file_size: pdf.length }) : new Response(pdf);
  });
  const file = await downloadWhatsappDocument('doc', 'token', 'number', 'rapor.pdf');
  assert.equal(file.originalname, 'rapor.pdf');
  assert.deepEqual(file.buffer, pdf);
  assert.equal((await downloadWhatsappDocument('doc', 'token', 'number')).originalname, 'whatsapp-doc.pdf');
  assert.equal(whatsappFileKind({ mimeType: 'application/pdf', size: 100 }), 'document');
  assert.throws(() => whatsappFileKind({ mimeType: 'application/zip', size: 100 }), /WhatsApp için/);
  assert.throws(() => whatsappFileKind({ mimeType: 'image/png', size: 6 * 1024 * 1024 }), /en fazla/);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ url: 'https://lookaside.fbsbx.com/doc', mime_type: 'application/zip', file_size: 100 }));
  await assert.rejects(downloadWhatsappDocument('doc', 'token', 'number'), /türü veya boyutu/);
});

test('multiple outbound WhatsApp files upload bytes and have independent send IDs, delivery logs and failures', async t => {
  const logs: any[] = [], tracked: any[] = [], sent: any[] = [];
  const restores: Array<() => void> = [];
  const stub = (target: any, key: string, fn: any) => { const old = target[key]; target[key] = fn; restores.push(() => { target[key] = old; }); };
  t.after(() => restores.reverse().forEach(restore => restore()));
  const create = async ({ data }: any) => { const row = { id: `log-${logs.length}`, ...data }; logs.push(row); return row; };
  stub(db.integrationSettings, 'findUnique', async () => ({ whatsappEnabled: true, whatsappAppSecret: 'secret', whatsappPhoneNumberId: 'number', whatsappAccessToken: 'token' }));
  stub(db.activityLog, 'create', create);
  stub(db.activityLog, 'update', async ({ where, data }: any) => Object.assign(logs.find(row => row.id === where.id), data));
  stub(db.activityLog, 'findFirst', async ({ where }: any) => logs.find(row => where.AND[1].OR.some((condition: any) => condition.id === row.id || condition.metadata?.equals === row.metadata.providerMessageId)));
  stub(db.externalMessage, 'upsert', async ({ create }: any) => { tracked.push(create); return create; });
  stub(db, '$transaction', async (work: any) => work({ externalMessage: { create: async () => ({}) }, activityLog: { create } }));
  let uploads = 0, rejectUploads = false;
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer token');
    if (String(url).endsWith('/media')) {
      uploads++;
      assert.ok(init?.body instanceof FormData);
      assert.equal(init.body.get('messaging_product'), 'whatsapp');
      const file = init.body.get('file') as File;
      const bytes = Buffer.from(await file.arrayBuffer());
      assert.deepEqual(bytes, file.type === 'image/png' ? png : Buffer.from('Document contents'));
      return rejectUploads ? Response.json({ error: { code: 190, message: 'Upload rejected' } }, { status: 401 }) : Response.json({ id: `media-${uploads}` });
    }
    const body = JSON.parse(String(init?.body)); sent.push(body);
    assert.ok(logs.some(log => log.id === body.biz_opaque_callback_data && log.action === 'conversation.channel_reply_requested'));
    return Response.json({ messages: [{ id: `wamid.${sent.length}` }] });
  });
  let stored: StoredUpload[] = [];
  try {
    await withStoredUploads([
      { originalname: 'çalışma.txt', mimetype: 'text/plain', size: 17, buffer: Buffer.from('Document contents') } as Express.Multer.File,
      { originalname: 'photo.png', mimetype: 'image/png', size: png.length, buffer: png } as Express.Multer.File,
    ], async files => {
      stored = files;
      const context = { conversationId: 'ticket', userId: 'agent', messageId: 'message' };
      await sendConversationChannelReply('WHATSAPP', { phone: '05551234567' }, 'Attached files', context, files);
      assert.equal(sent.length, 2);
      assert.equal(sent[0].type, 'document');
      assert.equal(sent[0].document.filename, 'çalışma.txt');
      assert.equal(sent[0].document.caption, 'Attached files');
      assert.equal(sent[1].type, 'image');
      assert.equal(sent[1].image.caption, undefined);
      assert.notEqual(sent[0].biz_opaque_callback_data, sent[1].biz_opaque_callback_data);
      assert.equal(tracked.length, 2);
      const payload = { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.2', status: 'delivered', recipient_id: '905551234567', biz_opaque_callback_data: sent[1].biz_opaque_callback_data }] } }] }] };
      const raw = Buffer.from(JSON.stringify(payload));
      await receiveMetaWebhook(payload, `sha256=${createHmac('sha256', 'secret').update(raw).digest('hex')}`, raw);
      assert.equal(logs.find(row => row.action === 'conversation.whatsapp_delivered').metadata.originalName, 'photo.png');
      await sendConversationChannelReply('WHATSAPP', { phone: '05551234567' }, 'x'.repeat(1100), context, [files[0]]);
      assert.equal(sent[2].type, 'text');
      assert.equal(sent[2].text.body.length, 1100);
      assert.equal(sent[3].document.caption, undefined);
      await sendConversationChannelReply('WHATSAPP', { phone: '05551234567' }, '', context, [files[0]]);
      assert.equal(sent[4].type, 'document');
      rejectUploads = true;
      const count = sent.length;
      await sendConversationChannelReply('WHATSAPP', { phone: '05551234567' }, 'Rejected', context, [files[0]]);
      assert.equal(sent.length, count);
      const failure = logs.find(row => row.action === 'conversation.channel_reply_failed');
      assert.match(failure.metadata.reason, /Upload rejected.*190/);
      assert.equal(failure.metadata.originalName, 'çalışma.txt');
    });
  } finally { await discardStoredUploads(stored); }
});
