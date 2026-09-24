import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ticketReplyAddress, replyAddressTicket } from '../src/services/email-reply-address.js';

test('a signed Gmail reply address identifies the ticket without a subject or reply headers', () => {
  const address = ticketReplyAddress('Support <support@gmail.com>', 650, 'test-secret')!;
  assert.equal(replyAddressTicket([address], 'test-secret'), 650);
  assert.equal(replyAddressTicket([address.replace('ticket-650-', 'ticket-652-')], 'test-secret'), undefined);
  assert.equal(replyAddressTicket([address], 'wrong-secret'), undefined);
  assert.equal(replyAddressTicket(['support@gmail.com'], 'test-secret'), undefined);
});
test('do not assume arbitrary mail providers support plus addressing or choose between conflicting targets', () => {
  assert.equal(ticketReplyAddress('support@example.test', 650, 'secret'), undefined);
  assert.equal(replyAddressTicket([ticketReplyAddress('support@gmail.com', 650, 'secret')!, ticketReplyAddress('support@gmail.com', 652, 'secret')!], 'secret'), undefined);
});
