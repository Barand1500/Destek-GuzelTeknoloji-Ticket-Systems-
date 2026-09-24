import { db } from '../src/config/db.js';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { env } from '../src/config/env.js';

const settings = await db.integrationSettings.findUniqueOrThrow({ where: { id: 'default' } });
const stored = settings.imapEnabled && settings.imapHost && settings.imapUser && settings.imapPassword;
const client = new ImapFlow(stored ? { host: settings.imapHost, port: settings.imapPort, secure: settings.imapSecure, auth: settings.imapAuthType === 'OAUTH2' ? { user: settings.imapUser, accessToken: settings.imapPassword } : { user: settings.imapUser, pass: settings.imapPassword }, logger: false } : { host: env.IMAP_HOST!, port: env.IMAP_PORT, secure: env.IMAP_SECURE || env.IMAP_PORT === 993, auth: { user: env.IMAP_USER!, pass: (env.IMAP_PASSWORD ?? env.IMAP_PASS)! }, logger: false });
try {
  await client.connect();
  const lock = await client.getMailboxLock('[Gmail]/Tüm Postalar', { readOnly: true });
  try {
    const message = await client.fetchOne(197, { source: true }, { uid: true });
    if (!message || !message.source) throw new Error('Source message missing');
    const parsed = await simpleParser(message.source);
    console.log(JSON.stringify({ from: parsed.from?.value, to: parsed.to, subject: parsed.subject, messageId: parsed.messageId, inReplyTo: parsed.inReplyTo, references: parsed.references, date: parsed.date }));
    console.log(JSON.stringify(await db.conversation.findMany({ where: { customer: { email: 'yunusdurgun22@gmail.com' }, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, number: true, subject: true, createdAt: true, customer: { select: { id: true, name: true, email: true } } } })));
  } finally { lock.release(); }
} finally { await client.logout().catch(() => {}); await db.$disconnect(); }
