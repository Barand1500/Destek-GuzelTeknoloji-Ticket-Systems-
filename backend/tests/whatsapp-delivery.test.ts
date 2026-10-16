import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { db } from '../src/config/db.js';
import { receiveMetaWebhook, sendConversationChannelReply } from '../src/services/integrations.service.js';

test('WhatsApp acceptance, signed delivery statuses and asynchronous failures are correlated and deduplicated', async t => {
  const logs: any[] = [];
  const statuses = new Set<string>();
  const restores: Array<() => void> = [];
  const stub = (target: any, key: string, value: any) => {
    const old = target[key]; target[key] = value; restores.push(() => { target[key] = old; });
  };
  t.after(() => restores.reverse().forEach(restore => restore()));
  const createLog = async ({ data }: any) => {
    const row = { id: `log-${logs.length}`, ...data }; logs.push(row); return row;
  };
  stub(db.integrationSettings, 'findUnique', async () => ({ whatsappEnabled: true, whatsappAppSecret: 'app-secret', whatsappPhoneNumberId: 'number-id', whatsappAccessToken: 'private-token' }));
  stub(db.activityLog, 'create', createLog);
  const outgoing: any[] = [];
  stub(db.externalMessage, 'upsert', async ({ create }: any) => { outgoing.push(create); return create; });
  stub(db.activityLog, 'update', async ({ where, data }: any) => Object.assign(logs.find(row => row.id === where.id), data));
  stub(db.activityLog, 'findFirst', async ({ where }: any) => logs.find(row => where.action.in.includes(row.action) && row.metadata.channel === 'WHATSAPP' && where.AND[1].OR.some((condition: any) => condition.id === row.id || condition.metadata?.equals === row.metadata.providerMessageId)) ?? null);
  stub(db, '$transaction', async (callback: any) => callback({
    externalMessage: { create: async ({ data }: any) => {
      if (statuses.has(data.externalId)) throw Object.assign(new Error('Duplicate'), { code: 'P2002' });
      statuses.add(data.externalId); return data;
    } }, activityLog: { create: createLog },
  }));
  let callbackId = '';
  stub(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    callbackId = body.biz_opaque_callback_data;
    assert.equal(body.to, '905551234567');
    assert.ok(logs.find(row => row.id === callbackId && row.action === 'conversation.channel_reply_requested'));
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.test' }] }), { status: 200 });
  });
  await sendConversationChannelReply('WHATSAPP', { phone: '05551234567' }, 'Test', { conversationId: 'ticket', userId: 'agent', messageId: 'message' });
  assert.equal(logs[0].action, 'conversation.channel_reply_sent');
  assert.equal(logs[0].metadata.providerMessageId, 'wamid.test');
  assert.equal(outgoing[0].conversationId, 'ticket');
  assert.equal(outgoing[0].provider, 'meta-whatsapp-outbound:905551234567');
  assert.equal(outgoing[0].externalId, 'wamid.test');
  assert.equal(logs.some(row => row.action === 'conversation.whatsapp_delivered'), false);
  const webhook = async (status: any, valid = true) => {
    const payload = { entry: [{ changes: [{ value: { statuses: [status] } }] }] };
    const raw = Buffer.from(JSON.stringify(payload));
    return receiveMetaWebhook(payload, valid ? `sha256=${createHmac('sha256', 'app-secret').update(raw).digest('hex')}` : 'invalid', raw);
  };
  const base = { id: 'wamid.test', timestamp: '1792052640', recipient_id: '905551234567', biz_opaque_callback_data: callbackId };
  await assert.rejects(webhook({ ...base, status: 'delivered' }, false), /imzası/);
  assert.equal(logs.length, 1);
  for (const status of ['sent', 'delivered', 'read']) {
    await webhook({ ...base, status });
    await webhook({ ...base, status });
    assert.equal(logs.filter(row => row.action === `conversation.whatsapp_${status}`).length, 1);
  }
  // Missing opaque callback still matches the stored provider message ID.
  await webhook({ ...base, biz_opaque_callback_data: undefined, status: 'failed', errors: [{ code: 131047, title: 'Re-engagement message', message: 'Outside allowed window', error_data: { details: 'Use a message template' } }] });
  const failure = logs.find(row => row.action === 'conversation.whatsapp_failed');
  assert.equal(failure.entityId, 'ticket');
  assert.equal(failure.userId, 'agent');
  assert.match(failure.metadata.reason, /131047.*Outside allowed window.*Use a message template/);
  assert.ok(failure.metadata.providerTimestamp);
  assert.doesNotMatch(JSON.stringify(logs), /private-token|app-secret/);

  // Correlation already exists when delivery beats the send HTTP response.
  stub(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    await webhook({ ...base, id: 'wamid.early', status: 'delivered', biz_opaque_callback_data: body.biz_opaque_callback_data });
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.early' }] }), { status: 200 });
  });
  await sendConversationChannelReply('WHATSAPP', { phone: '05551234567' }, 'Fast delivery', { conversationId: 'ticket', userId: 'agent' });
  assert.equal(logs.filter(row => row.action === 'conversation.whatsapp_delivered' && row.metadata.providerMessageId === 'wamid.early').length, 1);

  // Immediate HTTP rejection includes both the provider's code and explanation.
  stub(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { code: 190, message: 'Invalid access token' } }), { status: 401 }));
  await sendConversationChannelReply('WHATSAPP', { phone: '05551234567' }, 'Test', { conversationId: 'ticket', userId: 'agent' });
  const rejected = logs.find(row => row.action === 'conversation.channel_reply_failed');
  assert.match(rejected.metadata.reason, /Invalid access token.*190/);
});
