import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import { persistInboundMessage, receiveMetaWebhook } from '../src/services/integrations.service.js';
import { persistInboundEmail } from '../src/services/inbound-email.service.js';

test('WhatsApp replies stay in the sending ticket and never enter an email-only ticket', async t => {
  const suffix = randomUUID(), phone = `90555${randomInt(1000000, 9999999)}`;
  const people: string[] = [], conversations: string[] = [], logs: string[] = [];
  let departmentId = '';
  try {
    const customer = await db.user.create({ data: { name: `WA routing ${suffix}`, phone, role: 'CUSTOMER', passwordHash: 'test-only' } }); people.push(customer.id);
    const other = await db.user.create({ data: { name: `WA other ${suffix}`, phone: `90556${randomInt(1000000, 9999999)}`, role: 'CUSTOMER', passwordHash: 'test-only' } }); people.push(other.id);
    const department = await db.department.create({ data: { name: `WA routing ${suffix}` } }); departmentId = department.id;
    const make = async (subject: string, year: number, replyChannels: string[], customerId = customer.id) => {
      const row = await db.conversation.create({ data: { customerId, departmentId, subject, searchSubject: subject, channel: 'WHATSAPP', replyChannels, createdAt: new Date(`${year}-01-01T00:00:00Z`) } });
      conversations.push(row.id); return row;
    };
    const original = await make('Older WhatsApp ticket', 2020, ['WHATSAPP']);
    const emailOnly = await make('Newer converted email-only ticket', 2023, ['EMAIL']);
    const input = (replyToExternalId?: string) => ({ provider: 'meta-whatsapp', externalId: `test-${randomUUID()}`, channel: 'WHATSAPP' as const, sender: { phone }, body: 'Customer answer', departmentId, replyToExternalId });
    assert.equal(await persistInboundMessage(input()), original.id, 'the new email-only ticket must not capture WhatsApp replies');
    assert.equal(await db.conversationMessage.count({ where: { conversationId: emailOnly.id } }), 0);

    const email = `routing-${suffix}@example.test`;
    await db.user.update({ where: { id: customer.id }, data: { email } });
    const mail = (number: number, extra = {}) => persistInboundEmail({ mailbox: `test-${suffix}`, uid: randomInt(1, 2000000000), messageId: `<${randomUUID()}@example.test>`, from: { address: email }, subject: `Re: #TK-${number}`, body: 'Email answer', departmentId, ...extra });
    assert.equal(await mail(emailOnly.number), emailOnly.id);
    await db.conversation.update({ where: { id: original.id }, data: { replyChannels: ['EMAIL'] } });
    await db.conversation.update({ where: { id: emailOnly.id }, data: { replyChannels: ['WHATSAPP'] } });
    assert.equal(await persistInboundMessage(input()), emailOnly.id, 'WhatsApp follows the newly selected channel after swapping both tickets');
    assert.equal(await mail(original.number), original.id, 'email follows the newly selected channel even when the original channel was WhatsApp');
    const wrongTicketCount = await db.conversationMessage.count({ where: { conversationId: emailOnly.id } });
    assert.equal(await mail(emailOnly.number, { createTickets: false }), null, 'a stale email ticket reference cannot enter a WhatsApp-only ticket');
    assert.equal(await db.conversationMessage.count({ where: { conversationId: emailOnly.id } }), wrongTicketCount);
    await db.conversationMessage.createMany({ data: [original, emailOnly].map(row => ({ conversationId: row.id, authorId: customer.id, body: 'Previous answer', type: 'AGENT_REPLY' as const })) });
    assert.equal(await mail(original.number, { subject: 'No thread or ticket reference' }), original.id, 'unthreaded mail considers only email-enabled active tickets');
    await db.conversation.update({ where: { id: original.id }, data: { replyChannels: ['WHATSAPP'] } });
    await db.conversation.update({ where: { id: emailOnly.id }, data: { replyChannels: ['EMAIL'] } });
    // Reset the email fixture's history before the remaining WhatsApp isolation checks.
    await db.incomingEmail.deleteMany({ where: { conversationId: { in: [original.id, emailOnly.id] } } });
    await db.conversationMessage.deleteMany({ where: { conversationId: emailOnly.id } });

    const newer = await make('Another WhatsApp ticket', 2021, ['WHATSAPP', 'EMAIL']);
    const foreign = await make('Other customer WhatsApp ticket', 2020, ['WHATSAPP'], other.id);
    async function sent(conversationId: string, providerMessageId: string, year: number, recipient = phone, action = 'conversation.channel_reply_sent') {
      const row = await db.activityLog.create({ data: { userId: customer.id, entityId: conversationId, action, metadata: { channel: 'WHATSAPP', providerMessageId, recipient }, createdAt: new Date(`${year}-02-01T00:00:00Z`) } }); logs.push(row.id);
    }
    await sent(newer.id, 'quoted-message', 2022);
    await sent(original.id, 'latest-message', 2024);
    await sent(newer.id, 'different-phone-message', 2025, other.phone!);
    await sent(newer.id, 'failed-message', 2026, phone, 'conversation.channel_reply_failed');
    await sent(foreign.id, 'foreign-message', 2027, other.phone!);
    await sent(emailOnly.id, 'old-email-ticket-whatsapp-message', 2028);
    assert.equal(await persistInboundMessage(input()), original.id, 'without quoted context, use the latest successful WhatsApp send to this phone');
    assert.equal(await persistInboundMessage(input('quoted-message')), newer.id, 'an explicit reply belongs to its quoted message even when another ticket sent more recently');
    assert.equal(await persistInboundMessage(input('foreign-message')), original.id, 'a quote must not cross customer ownership');
    assert.equal(await persistInboundMessage(input('old-email-ticket-whatsapp-message')), original.id, 'old WhatsApp history must not override an email-only channel selection');
    assert.deepEqual((await db.conversation.findUniqueOrThrow({ where: { id: emailOnly.id } })).replyChannels, ['EMAIL']);
    assert.equal(await db.conversationMessage.count({ where: { conversationId: emailOnly.id } }), 0);

    const originalSettings = db.integrationSettings.findUnique;
    t.after(() => { db.integrationSettings.findUnique = originalSettings; });
    const secret = 'routing-test-secret';
    db.integrationSettings.findUnique = (async () => ({ whatsappEnabled: true, whatsappAppSecret: secret, whatsappDepartmentId: departmentId })) as typeof originalSettings;
    const payload = { entry: [{ changes: [{ value: { messages: [{ id: `webhook-${randomUUID()}`, from: phone, type: 'text', text: { body: 'Quoted webhook reply' }, context: { id: 'quoted-message' } }] } }] }] };
    const raw = Buffer.from(JSON.stringify(payload));
    const signature = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    assert.deepEqual(await receiveMetaWebhook(payload, signature, raw), [newer.id]);
    assert.equal(await db.conversationMessage.count({ where: { conversationId: newer.id, body: 'Quoted webhook reply' } }), 1);
    assert.deepEqual(await receiveMetaWebhook(payload, signature, raw), [newer.id]);
    assert.equal(await db.conversationMessage.count({ where: { conversationId: newer.id, body: 'Quoted webhook reply' } }), 1);

    // Operational logs can be purged; durable provider IDs must still route replies.
    await db.externalMessage.createMany({ data: [
      { provider: `meta-whatsapp-outbound:${phone}`, externalId: 'durable-older', channel: 'WHATSAPP', conversationId: original.id, createdAt: new Date('2028-01-01T00:00:00Z') },
      { provider: `meta-whatsapp-outbound:${phone}`, externalId: 'durable-latest', channel: 'WHATSAPP', conversationId: newer.id, createdAt: new Date('2029-01-01T00:00:00Z') },
    ] });
    await db.activityLog.deleteMany({ where: { id: { in: logs } } });
    assert.equal(await persistInboundMessage(input()), newer.id);
    assert.equal(await persistInboundMessage(input('durable-older')), original.id);

    await db.conversation.updateMany({ where: { id: { in: [original.id, newer.id] } }, data: { replyChannels: ['EMAIL'] } });
    const fresh = await persistInboundMessage(input()); conversations.push(fresh);
    assert.ok(![original.id, newer.id, emailOnly.id].includes(fresh), 'start a new WhatsApp ticket when none of the existing tickets accept WhatsApp');
    assert.equal((await db.conversation.findUniqueOrThrow({ where: { id: fresh } })).channel, 'WHATSAPP');
  } finally {
    await db.notification.deleteMany({ where: { conversationId: { in: conversations } } });
    await db.activityLog.deleteMany({ where: { OR: [{ id: { in: logs } }, { entityId: { in: conversations } }] } });
    await db.externalMessage.deleteMany({ where: { conversationId: { in: conversations } } });
    await db.incomingEmail.deleteMany({ where: { conversationId: { in: conversations } } });
    await db.conversationMessage.deleteMany({ where: { conversationId: { in: conversations } } });
    await db.conversation.deleteMany({ where: { id: { in: conversations } } });
    await db.user.deleteMany({ where: { id: { in: people } } });
    if (departmentId) await db.department.delete({ where: { id: departmentId } });
    await db.$disconnect();
  }
});
