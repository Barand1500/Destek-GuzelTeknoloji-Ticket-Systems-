import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomInt, createHmac } from 'node:crypto';
import { unlink, readFile } from 'node:fs/promises';
import path from 'node:path';
import { uploadRoot } from '../src/services/uploads.service.js';
import { canonicalPhone, matchesPhone } from '../src/services/inbound-phone-matching.js';

test('phone matching compares whole numbers across Turkish formats and extra contacts', () => {
  for (const phone of ['0541 258 44 72', '+90 (541) 258-44-72', '00905412584472', '5412584472']) {
    assert.equal(canonicalPhone(phone), '905412584472');
    assert.equal(matchesPhone({ phone }, '905412584472'), true);
  }
  assert.equal(matchesPhone({ phone: '0532 567 46 60', extraPhones: '0541 258 44 72, +1 631 555 1181' }, '905412584472'), true);
  assert.equal(matchesPhone({ phone: '905412584473' }, '905412584472'), false);
  assert.equal(matchesPhone({ phone: '1905412584472' }, '905412584472'), false);
  assert.equal(matchesPhone({ phone: null }, ''), false);
});

test('WhatsApp reuses customers and tickets, switches on new requests, and handles concurrent delivery', async () => {
  const { db } = await import('../src/config/db.js');
  const { persistInboundMessage, receiveMetaWebhook } = await import('../src/services/integrations.service.js');
  const suffix = randomUUID();
  const phone = `0555${randomInt(1000000, 9999999)}`;
  const concurrentPhone = `199${randomInt(100000000, 999999999)}`;
  const name = `WhatsApp regression ${suffix}`;
  const users: string[] = [];
  let departmentId: string | undefined;
  const input = (externalId = randomUUID(), senderPhone = canonicalPhone(phone)) => ({
    provider: `test-whatsapp-${suffix}`, externalId, channel: 'WHATSAPP' as const,
    sender: { phone: senderPhone, name }, body: 'Test message', departmentId,
  });
  try {
    const department = await db.department.create({ data: { name } });
    departmentId = department.id;
    const customer = await db.user.create({ data: { name, phone: phone.replace(/(\d{4})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4'), role: 'CUSTOMER', passwordHash: 'test-only', createdAt: new Date('2020-01-01') } });
    users.push(customer.id);
    const duplicate = await db.user.create({ data: { name, phone: canonicalPhone(phone), role: 'CUSTOMER', passwordHash: 'test-only' } });
    users.push(duplicate.id);
    const first = await persistInboundMessage(input());
    assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: first } })).customerId, customer.id);
    assert.equal(await persistInboundMessage(input()), first);
    assert.equal(await db.conversation.count({ where: { customerId: customer.id } }), 1);
    const replay = input();
    assert.equal(await persistInboundMessage(replay), first);
    const count = await db.conversationMessage.count({ where: { conversationId: first } });
    assert.equal(await persistInboundMessage(replay), first);
    assert.equal(await db.conversationMessage.count({ where: { conversationId: first } }), count);

    const originalSettings = db.integrationSettings.findUnique;
    const originalFetch = globalThis.fetch;
    const secret = 'photo-webhook-test-secret';
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5xkAAAAASUVORK5CYII=', 'base64');
    let fetches = 0;
    try {
      db.integrationSettings.findUnique = (async () => ({ whatsappEnabled: true, whatsappAppSecret: secret, whatsappAccessToken: 'test-token', whatsappPhoneNumberId: '456', whatsappDepartmentId: departmentId })) as typeof originalSettings;
      globalThis.fetch = async () => {
        fetches++;
        return fetches % 2 === 1 ? Response.json({ url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/123', mime_type: 'image/png', file_size: png.length }) : new Response(png);
      };
      for (const caption of [undefined, 'Photo caption']) {
        const externalId = randomUUID();
        const payload = { entry: [{ changes: [{ value: { messages: [{ id: externalId, from: canonicalPhone(phone), type: 'image', image: { id: '123', caption } }] } }] }] };
        const raw = Buffer.from(JSON.stringify(payload));
        const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
        assert.deepEqual(await receiveMetaWebhook(payload, signature, raw), [first]);
        const photo = await db.conversationMessage.findFirstOrThrow({ where: { conversationId: first, body: caption ?? 'Fotoğraf' }, include: { attachments: true } });
        assert.equal(photo.attachments.length, 1);
        assert.equal(photo.attachments[0].mimeType, 'image/png');
        assert.deepEqual(await readFile(path.join(uploadRoot, photo.attachments[0].storageKey)), png);
        const beforeReplay = fetches;
        assert.deepEqual(await receiveMetaWebhook(payload, signature, raw), [first]);
        assert.equal(fetches, beforeReplay);
        assert.equal(await db.conversationAttachment.count({ where: { messageId: photo.id } }), 1);
      }
    } finally {
      db.integrationSettings.findUnique = originalSettings;
      globalThis.fetch = originalFetch;
    }

    await db.conversation.update({ where: { id: first }, data: { status: 'CLOSED', closedAt: new Date() } });
    assert.equal(await persistInboundMessage(input()), first);
    assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: first } })).closedAt, null);

    const manual = await db.conversation.create({ data: { customerId: customer.id, departmentId, subject: 'New manual request', searchSubject: 'new manual request', channel: 'TICKET' } });
    await db.conversation.update({ where: { id: first }, data: { updatedAt: new Date(Date.now() + 60_000) } });
    const email = await db.conversation.create({ data: { customerId: customer.id, departmentId, subject: 'Unrelated email', searchSubject: 'unrelated email', channel: 'EMAIL' } });
    const oldNumber = (await db.conversation.findUniqueOrThrow({ where: { id: first } })).number;
    assert.equal(await persistInboundMessage({ ...input(), body: `Message mentioning #TK-${oldNumber}` }), manual.id);
    assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: manual.id } })).channel, 'WHATSAPP');
    assert.equal(await db.conversationMessage.count({ where: { conversationId: email.id } }), 0);

    const concurrent = await Promise.all([persistInboundMessage(input(randomUUID(), concurrentPhone)), persistInboundMessage(input(randomUUID(), concurrentPhone))]);
    assert.equal(concurrent[0], concurrent[1]);
    assert.equal(await db.user.count({ where: { name, phone: concurrentPhone } }), 1);
    assert.equal(await db.conversationMessage.count({ where: { conversationId: concurrent[0] } }), 2);
    const replayConcurrent = input(randomUUID(), concurrentPhone);
    await Promise.all([persistInboundMessage(replayConcurrent), persistInboundMessage(replayConcurrent)]);
    assert.equal(await db.conversationMessage.count({ where: { conversationId: concurrent[0] } }), 3);

    await db.user.update({ where: { id: customer.id }, data: { phone: null, extraPhones: `+90 ${phone.slice(1)}` } });
    assert.equal(await persistInboundMessage(input()), manual.id);
  } finally {
    // Only remove records created by this test, never existing customer data.
    const testUsers = await db.user.findMany({ where: { OR: [{ id: { in: users } }, { name }] }, select: { id: true } });
    const ids = testUsers.map(user => user.id);
    const conversations = await db.conversation.findMany({ where: { customerId: { in: ids } }, select: { id: true } });
    const conversationIds = conversations.map(conversation => conversation.id);
    await db.notification.deleteMany({ where: { conversationId: { in: conversationIds } } });
    await db.activityLog.deleteMany({ where: { userId: { in: ids } } });
    const files = await db.conversationAttachment.findMany({ where: { message: { conversationId: { in: conversationIds } } }, select: { storageKey: true } });
    await Promise.allSettled(files.map(file => unlink(path.join(uploadRoot, file.storageKey))));
    await db.externalMessage.deleteMany({ where: { conversationId: { in: conversationIds } } });
    await db.conversationMessage.deleteMany({ where: { conversationId: { in: conversationIds } } });
    await db.conversation.deleteMany({ where: { id: { in: conversationIds } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    if (departmentId) await db.department.delete({ where: { id: departmentId } });
    await db.$disconnect();
  }
});
