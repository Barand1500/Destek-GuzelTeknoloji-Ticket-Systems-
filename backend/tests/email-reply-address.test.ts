import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { hasTicketReplyTag, ticketReplyAddress, replyAddressTicket } from '../src/services/email-reply-address.js';

test('a signed Gmail reply address identifies the ticket without a subject or reply headers', () => {
  const address = ticketReplyAddress('Support <support@gmail.com>', 650, 'test-secret')!;
  assert.match(address, /^support\+t-i2-[a-z2-7]{16}@gmail\.com$/);
  assert.equal(replyAddressTicket([address], 'test-secret'), 650);
  assert.equal(replyAddressTicket([address.replace('+t-i2-', '+t-i4-')], 'test-secret'), undefined);
  assert.equal(replyAddressTicket([address], 'wrong-secret'), undefined);
  assert.equal(replyAddressTicket(['support@gmail.com'], 'test-secret'), undefined);
});
test('previous compact and legacy long reply addresses remain valid', () => {
  const fullSignature = createHmac('sha256', 'test-secret').update('ticket-email-reply:650').digest('hex');
  const transitionalAddress = `support+t-i2-${fullSignature.slice(0, 12)}@gmail.com`;
  const legacySignature = fullSignature.slice(0, 20);
  const legacyAddress = `support+ticket-650-${legacySignature}@gmail.com`;
  assert.equal(replyAddressTicket([transitionalAddress], 'test-secret'), 650);
  assert.equal(replyAddressTicket([legacyAddress], 'test-secret'), 650);
  assert.equal(hasTicketReplyTag([legacyAddress]), true);
  assert.equal(hasTicketReplyTag(['support+t-i2-invalid@gmail.com']), true);
  assert.equal(hasTicketReplyTag(['support@gmail.com']), false);
});
test('do not assume arbitrary mail providers support plus addressing or choose between conflicting targets', () => {
  assert.equal(ticketReplyAddress('support@example.test', 650, 'secret'), undefined);
  assert.equal(replyAddressTicket([ticketReplyAddress('support@gmail.com', 650, 'secret')!, ticketReplyAddress('support@gmail.com', 652, 'secret')!], 'secret'), undefined);
});
