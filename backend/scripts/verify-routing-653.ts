import assert from 'node:assert/strict';
import { db } from '../src/config/db.js';
import { persistInboundEmail } from '../src/services/inbound-email.service.js';

// Replay the observed sender/subject against live read-only matching queries.
// Intercept deduplication and every transactional write in this isolated process.
const incomingLookup = db.incomingEmail.findFirst.bind(db.incomingEmail);
const transaction = db.$transaction;
let routedTo: string | undefined;
try {
  db.incomingEmail.findFirst = (async (args: any) => args.where.OR ? null : incomingLookup(args)) as any;
  db.$transaction = (async (callback: any) => callback({
    conversation: { create: async () => { throw new Error('Regression: unexpected new ticket'); }, update: async () => ({}) },
    conversationMessage: { create: async ({ data }: any) => { routedTo = data.conversationId; } },
    incomingEmail: { create: async () => ({}) },
    activityLog: { create: async () => ({}) },
    user: { findMany: async () => [] },
  })) as any;
  await persistInboundEmail({ mailbox: '[Gmail]/Tüm Postalar', uid: 197, from: { address: 'yunusdurgun22@gmail.com', name: 'Yunus Durgun' }, subject: 'Konu', body: 'Mesaji aldim', recipients: ['guzelteknoloji50@gmail.com'] });
  assert.equal(routedTo, '0f980c84-03c5-4a80-bb6c-f9a5a9ce21d6');
  console.log('PASS: original #653 input routes to #650; no database writes or emails.');
} finally {
  db.incomingEmail.findFirst = incomingLookup;
  db.$transaction = transaction;
  await db.$disconnect();
}
