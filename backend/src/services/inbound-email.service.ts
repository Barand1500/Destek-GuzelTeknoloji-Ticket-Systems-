import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { db } from "../config/db.js";
import { env } from "../config/env.js";
import { notifyConversation, publishChange } from "./events.service.js";
import type { Actor } from "../types/express.js";
import { matchesSender, selectEmailCustomer } from './inbound-email-matching.js';
import { replyAddressTicket } from './email-reply-address.js';

let running = false;
let timer: NodeJS.Timeout | undefined;
let lastStoredPollAt = 0;

export function inboundReplyText(value: string) {
  const text = value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<\/(?:div|blockquote|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  // Gmail adds one of these lines before the quoted original message. Do not
  // store that original message as a second customer reply in the ticket.
  const quoteStart = lines.findIndex((line) => {
    const normalized = line.trim();
    return normalized.startsWith(">")
      || /(?:şunu yazdı|wrote):\s*$/i.test(normalized)
      // Gmail can omit the trailing “şunu yazdı” portion when it creates its
      // plain-text alternative, leaving only this localized date header.
      || /\d{1,2}\s+\S+\s+\d{4}.*\btarihinde\b/i.test(normalized)
      || /^(?:-{2,}\s*)?(?:original message|forwarded message)/i.test(normalized);
  });
  return lines
    .slice(0, quoteStart >= 0 ? quoteStart : undefined)
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 10_000);
}

export async function persistInboundEmail(input: {
  mailbox: string;
  uid: number;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  recipients?: string[];
  from: { address: string; name?: string };
  subject: string;
  body: string;
  departmentId?: string | null;
  createTickets?: boolean;
  createReplies?: boolean;
}) {
  const known = await db.incomingEmail.findFirst({ where: { OR: [{ mailbox: input.mailbox, uid: input.uid }, ...(input.messageId ? [{ messageId: input.messageId }] : [])] } });
  if (known) return known.conversationId;

  const email = input.from.address.trim().toLowerCase();
  const matchingCustomers = (await db.user.findMany({ where: { role: "CUSTOMER", deletedAt: null, OR: [{ email }, { extraEmails: { contains: email } }] }, orderBy: { createdAt: "asc" } })).filter(customer => matchesSender(customer, email));
  const senderScope = { customerId: { in: matchingCustomers.map(customer => customer.id) }, deletedAt: null, status: { not: 'CLOSED' } };

  const ticketNumber = replyAddressTicket(input.recipients ?? [], env.JWT_ACCESS_SECRET) ?? /#(?:TK-)?0*(\d{1,10})\b|\[(?:TK-)?0*(\d{1,10})\]/i.exec(input.subject)?.slice(1).find(Boolean);
  let conversation = ticketNumber
    ? await db.conversation.findFirst({ where: { ...senderScope, number: Number(ticketNumber) } })
    : null;
  // Gmail preserves these headers even when a reply's subject is edited.
  const references = [...new Set([input.inReplyTo, ...(input.references ?? []).slice().reverse()].filter((value): value is string => Boolean(value)))].slice(0, 20);
  for (const messageId of references) {
    if (conversation || !matchingCustomers.length) break;
    const incoming = await db.incomingEmail.findFirst({ where: { messageId, conversation: senderScope } });
    if (incoming) conversation = await db.conversation.findFirst({ where: { ...senderScope, id: incoming.conversationId } });
    if (conversation) break;
    const outgoing = await db.activityLog.findFirst({ where: { action: 'conversation.email_sent', entityType: 'Conversation', metadata: { path: '$.messageId', equals: messageId } }, orderBy: { createdAt: 'desc' } });
    if (outgoing) conversation = await db.conversation.findFirst({ where: { ...senderScope, id: outgoing.entityId } });
  }
  let customer = conversation ? matchingCustomers.find(item => item.id === conversation!.customerId) : selectEmailCustomer(matchingCustomers, email, input.from.name);
  // Some clients send a fresh message to the general mailbox with no threading
  // information. Continue only an unambiguous, already answered active request.
  // Never override an explicit (possibly foreign) ticket/reference with a guess.
  if (!conversation && customer && !ticketNumber && !references.length && !(input.recipients ?? []).some(address => address.includes('+ticket-'))) {
    const active = await db.conversation.findMany({
      where: { customerId: customer.id, deletedAt: null, status: { in: ['OPEN', 'PENDING'] }, messages: { some: { type: 'AGENT_REPLY' } } },
      take: 2,
      include: { messages: { where: { type: 'AGENT_REPLY' }, select: { id: true }, take: 1 } },
    });
    if (active.length === 1 && active[0].messages.length) conversation = active[0];
  }
  if (conversation && input.createReplies === false) return conversation.id;
  if (!conversation && input.createTickets === false) return null;
  if (!customer) {
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
    customer = await db.user.create({
      data: { name: input.from.name?.trim().slice(0, 100) || email, email, passwordHash, role: "CUSTOMER" },
    });
  }
  const department = conversation ? null : await db.department.findFirst({ where: { ...(input.departmentId ? { id: input.departmentId } : {}), isActive: true, deletedAt: null }, orderBy: { name: "asc" } }) ?? await db.department.findFirst({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" } });
  if (!conversation && !department) throw new Error("Gelen e-posta için aktif departman bulunamadı.");

  const customerActor: Actor = { id: customer.id, name: customer.name, email: customer.email ?? email, role: "CUSTOMER", departmentIds: [], sessionId: "imap" };
  const result = await db.$transaction(async (tx) => {
    let target = conversation;
    if (!target) {
      target = await tx.conversation.create({
        data: {
          subject: input.subject.slice(0, 200) || "E-posta desteği",
          searchSubject: (input.subject || "E-posta desteği").normalize("NFKC").toLocaleLowerCase("tr-TR").slice(0, 200),
          channel: "EMAIL",
          customerId: customer.id,
          departmentId: department!.id,
        },
      });
    }
    await tx.conversationMessage.create({ data: { conversationId: target.id, authorId: customer.id, body: input.body, type: "CUSTOMER_MESSAGE" } });
    await tx.incomingEmail.create({ data: { mailbox: input.mailbox, uid: input.uid, messageId: input.messageId, conversationId: target.id } });
    await tx.conversation.update({ where: { id: target.id }, data: { status: "OPEN" } });
    await tx.activityLog.create({ data: { userId: customer.id, action: "conversation.email_received", entityId: target.id, metadata: { mailbox: input.mailbox, uid: input.uid, senderEmail: email, messageId: input.messageId ?? null, inReplyTo: input.inReplyTo ?? null } } });
    await notifyConversation(tx, customerActor, target, "EMAIL_RECEIVED", "Yeni e-posta mesajı");
    return target.id;
  });
  publishChange(result);
  return result;
}

export async function syncInboundEmail() {
  const integration = await db.integrationSettings.findUnique({ where: { id: "default" } });
  const hasStored = Boolean(integration && (integration.imapHost || integration.imapUser || integration.imapPassword));
  const useStored = Boolean(hasStored && integration?.imapEnabled);
  if (hasStored && !integration!.imapEnabled) return { configured: false, processed: 0 };
  const config = { host: integration?.imapHost || env.IMAP_HOST, port: hasStored ? integration!.imapPort : env.IMAP_PORT, secure: hasStored ? integration!.imapSecure : (env.IMAP_SECURE || env.IMAP_PORT === 993), authType: hasStored ? integration!.imapAuthType : "BASIC", user: integration?.imapUser || env.IMAP_USER, password: integration?.imapPassword || env.IMAP_PASSWORD || env.IMAP_PASS, mailbox: hasStored ? integration!.imapMailbox : env.IMAP_MAILBOX, interval: hasStored ? integration!.imapPollIntervalSeconds : env.IMAP_POLL_INTERVAL_SECONDS, departmentId: integration?.imapDepartmentId || null, createTickets: hasStored ? integration!.imapCreateTickets : true, createReplies: hasStored ? integration!.imapCreateReplies : true };
  const configured = Boolean(config.host && config.user && config.password);
  if (!configured || running) return { configured, processed: 0 };
  if (useStored && Date.now() - lastStoredPollAt < config.interval * 1000) return { configured, processed: 0 };
  if (useStored) lastStoredPollAt = Date.now();
  running = true;
  const client = new ImapFlow({
    host: config.host!,
    port: config.port,
    secure: config.secure,
    auth: config.authType === "OAUTH2" ? { user: config.user!, accessToken: config.password! } : { user: config.user!, pass: config.password! },
    logger: false,
  });
  // ImapFlow can emit an error after connect() has already rejected. Without
  // a listener that background error terminates the entire API process.
  client.on('error', (error: Error) => {
    console.error('IMAP bağlantı hatası:', error.message);
  });
  let processed = 0;
  try {
    await client.connect();
      const lock = await client.getMailboxLock(config.mailbox);
    try {
        const since = new Date(Date.now() - env.IMAP_LOOKBACK_HOURS * 60 * 60 * 1000);
      const uids = (await client.search({ since }, { uid: true })) || [];
      if (!uids.length) return { configured, processed };
      for (const uid of uids.slice(-20)) {
        const message = await client.fetchOne(uid, { uid: true, source: true }, { uid: true });
        if (!message || !message.source || !message.uid) continue;
        const parsed = await simpleParser(message.source);
        const sender = parsed.from?.value.find((value) => value.address)?.address;
        const body = inboundReplyText(parsed.text || parsed.html || "");
        if (!sender || !body) continue;
        if (sender.trim().toLowerCase() === config.user!.trim().toLowerCase()) continue;
        await persistInboundEmail({
          mailbox: config.mailbox,
          uid: message.uid,
          messageId: parsed.messageId || undefined,
          inReplyTo: parsed.inReplyTo || undefined,
          references: typeof parsed.references === 'string' ? [parsed.references] : parsed.references,
          recipients: (Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : []).flatMap(group => group.value.map(recipient => recipient.address ?? '')),
          from: { address: sender, name: parsed.from?.value.find((value) => value.address)?.name },
          subject: parsed.subject || "E-posta desteği",
          body,
          departmentId: config.departmentId,
          createTickets: config.createTickets,
          createReplies: config.createReplies,
        });
        await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true });
        processed++;
      }
    } finally {
      lock.release();
    }
  } catch (error) {
    const detail = error instanceof AggregateError ? [...error.errors].map((item) => item instanceof Error ? `${item.name}: ${item.message}` : String(item)).join(" | ") : error instanceof Error ? (error.message || error.cause?.toString() || error.name) : String(error);
    console.error(`Gelen e-posta alınamadı: ${detail}`);
  } finally {
    await client.logout().catch(() => undefined);
    running = false;
  }
  return { configured, processed };
}

export function startInboundEmailPolling() {
  if (timer) return;
  const poll = () => { void syncInboundEmail().catch(error => console.error('E-posta taraması başarısız:', error instanceof Error ? error.message : String(error))); };
  poll();
  timer = setInterval(poll, 15_000);
  timer.unref();
}

export function stopInboundEmailPolling() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
