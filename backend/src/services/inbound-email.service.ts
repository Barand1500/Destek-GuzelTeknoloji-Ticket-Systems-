import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { db } from "../config/db.js";
import { env } from "../config/env.js";
import { notifyConversation, publishChange } from "./events.service.js";
import type { Actor } from "../types/express.js";
import { matchesSender, selectEmailCustomer } from './inbound-email-matching.js';

let running = false;
let timer: NodeJS.Timeout | undefined;
let lastStoredPollAt = 0;

function plainText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 10_000);
}

export async function persistInboundEmail(input: {
  mailbox: string;
  uid: number;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
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

  const ticketNumber = /#(?:TK-)?0*(\d{1,10})\b|\[(?:TK-)?0*(\d{1,10})\]/i.exec(input.subject)?.slice(1).find(Boolean);
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
  const useStored = Boolean(integration?.imapEnabled && integration.imapHost && integration.imapUser && integration.imapPassword);
  const config = useStored ? { host: integration!.imapHost, port: integration!.imapPort, secure: integration!.imapSecure, authType: integration!.imapAuthType, user: integration!.imapUser, password: integration!.imapPassword, mailbox: integration!.imapMailbox, interval: integration!.imapPollIntervalSeconds, departmentId: integration!.imapDepartmentId, createTickets: integration!.imapCreateTickets, createReplies: integration!.imapCreateReplies } : { host: env.IMAP_HOST, port: env.IMAP_PORT, secure: env.IMAP_SECURE || env.IMAP_PORT === 993, authType: "BASIC", user: env.IMAP_USER, password: env.IMAP_PASSWORD ?? env.IMAP_PASS, mailbox: env.IMAP_MAILBOX, interval: env.IMAP_POLL_INTERVAL_SECONDS, departmentId: null, createTickets: true, createReplies: true };
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
        const body = plainText(parsed.text || parsed.html || "");
        if (!sender || !body) continue;
        if (sender.trim().toLowerCase() === config.user!.trim().toLowerCase()) continue;
        await persistInboundEmail({
          mailbox: config.mailbox,
          uid: message.uid,
          messageId: parsed.messageId || undefined,
          inReplyTo: parsed.inReplyTo || undefined,
          references: typeof parsed.references === 'string' ? [parsed.references] : parsed.references,
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
  void syncInboundEmail();
  timer = setInterval(() => void syncInboundEmail(), 15_000);
  timer.unref();
}

export function stopInboundEmailPolling() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
